import { InputHandler, RawPoint } from './InputHandler';
import { Renderer, BrushTextureType, createRenderer } from '../renderer/Renderer';
import { getWasm, StrokeSmoother } from '../wasm/wasmLoader';
import { LayerManager } from '../layer/LayerManager';
import { UndoManager } from '../history/UndoManager';

export interface BrushSettings {
  size: number;
  color: number[]; // [r, g, b, a] normalized 0-1
  opacity: number;         // 0-1, base alpha multiplier
  hardness: number;        // 0-1, edge softness (WebGPU smoothstep threshold)
  pressureGamma: number;   // gamma exponent for pressure curve (0.1-2.0; <1 = more sensitive at light touch)
  smoothingAlpha: number;
  smoothingStages: number;
  colorMixing: boolean;    // Kubelka-Munk color mixing enabled
  colorMixRate: number;    // pickup rate 0.0 (pure brush) - 1.0 (pure canvas)
}

interface SmoothedPoint {
  x: number;
  y: number;
  pressure: number;
}

export class CanvasManager {
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private inputHandler: InputHandler;
  private brush: BrushSettings;
  private lastPoint: SmoothedPoint | null = null;

  // Wasm stroke smoothing
  private smoother: StrokeSmoother | null = null;
  private useWasmSmoothing = false;

  // Layer integration
  private layerManager: LayerManager | null = null;
  // Offscreen canvas (alpha: true) that captures strokes for the active layer only.
  // Runs in parallel with the display renderer during a stroke, then its ImageData
  // is committed to LayerManager on strokeEnd.
  // NOTE: When using the WebGPU renderer, the display stroke uses GPU grain textures
  // while this canvas uses plain Canvas2D — an accepted POC limitation.
  private activeLayerCanvas: HTMLCanvasElement | null = null;
  private activeLayerCtx: CanvasRenderingContext2D | null = null;

  // Kubelka-Munk: evolving brush color during a stroke
  private currentMixedColor: number[] | null = null;

  // Undo/Redo
  private undoManager: UndoManager | null = null;
  private strokeBeforeSnapshot: ImageData | null = null;

  private constructor(canvas: HTMLCanvasElement, renderer: Renderer) {
    this.canvas = canvas;
    this.renderer = renderer;

    this.brush = {
      size: 10,
      color: [0, 0, 0, 1], // Black
      opacity: 1.0,
      hardness: 0.7,
      pressureGamma: 0.5,
      smoothingAlpha: 0.4,
      smoothingStages: 3,
      colorMixing: false,
      colorMixRate: 0.5,
    };

    // Initialize Wasm smoother if available
    this.initSmoother();

    this.inputHandler = new InputHandler(canvas, {
      onStrokeStart: this.handleStrokeStart.bind(this),
      onStrokeMove: this.handleStrokeMove.bind(this),
      onStrokeEnd: this.handleStrokeEnd.bind(this),
    });
  }

  static async create(canvas: HTMLCanvasElement): Promise<CanvasManager> {
    const renderer = await createRenderer(canvas);
    return new CanvasManager(canvas, renderer);
  }

  getRendererType(): 'canvas2d' | 'webgpu' {
    return this.renderer.getType();
  }

  getRenderer(): Renderer {
    return this.renderer;
  }

  /**
   * LayerManager を接続する。接続後は描画がレイヤーシステムと統合される。
   */
  public setLayerManager(lm: LayerManager): void {
    this.layerManager = lm;
    this.syncActiveLayerCanvas();
    // 初期表示: 合成結果をレンダラーに反映
    this.onLayerChanged();
  }

  public setUndoManager(um: UndoManager): void {
    this.undoManager = um;
  }

  public undo(): void {
    // Block undo while a stroke is in progress
    if (this.lastPoint !== null) return;
    if (!this.undoManager || !this.layerManager) return;
    const entry = this.undoManager.popUndo();
    if (!entry) return;

    const idx = this.layerManager.findLayerIndexById(entry.layerId);
    if (idx < 0) return;

    const current = this.cloneImageData(this.layerManager.getLayerImageData(idx));
    if (current) {
      this.undoManager.pushToRedo({ layerId: entry.layerId, imageData: current });
    }
    this.layerManager.setLayerImageData(idx, entry.imageData);
  }

  public redo(): void {
    // Block redo while a stroke is in progress
    if (this.lastPoint !== null) return;
    if (!this.undoManager || !this.layerManager) return;
    const entry = this.undoManager.popRedo();
    if (!entry) return;

    const idx = this.layerManager.findLayerIndexById(entry.layerId);
    if (idx < 0) return;

    const current = this.cloneImageData(this.layerManager.getLayerImageData(idx));
    if (current) {
      this.undoManager.pushToUndo({ layerId: entry.layerId, imageData: current });
    }
    this.layerManager.setLayerImageData(idx, entry.imageData);
  }

  public canUndo(): boolean {
    return this.undoManager?.canUndo() ?? false;
  }

  public canRedo(): boolean {
    return this.undoManager?.canRedo() ?? false;
  }

  public clearUndoHistory(): void {
    this.undoManager?.clear();
  }

  private cloneImageData(data: ImageData | null): ImageData | null {
    if (!data) return null;
    return new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
  }

  /**
   * アクティブレイヤーの ImageData を activeLayerCtx にロードする。
   * レイヤー切替・ファイルロード後に呼ばれる。
   */
  private syncActiveLayerCanvas(): void {
    if (!this.layerManager) return;

    const w = this.layerManager.getWidth();
    const h = this.layerManager.getHeight();

    // canvas がなければ作成（alpha: true でレイヤーの透明ピクセルを正確に扱う）
    if (!this.activeLayerCanvas) {
      this.activeLayerCanvas = document.createElement('canvas');
      const ctx = this.activeLayerCanvas.getContext('2d', { alpha: true });
      if (!ctx) throw new Error('Failed to create 2D context for active layer canvas');
      this.activeLayerCtx = ctx;
    }

    this.activeLayerCanvas.width = w;
    this.activeLayerCanvas.height = h;
    this.activeLayerCtx!.clearRect(0, 0, w, h);

    const data = this.layerManager.getActiveLayerImageData();
    if (data) {
      this.activeLayerCtx!.putImageData(data, 0, 0);
    }
  }

  /**
   * レイヤー変更時（レイヤー操作・strokeEnd後の onChange 経由）に呼ぶ。
   * 全レイヤーを合成してレンダラーに反映し、activeLayerCanvas を同期する。
   */
  public onLayerChanged(): void {
    if (!this.layerManager) return;

    // レイヤーが1枚だけなら合成をスキップして直接 ImageData を使う（パフォーマンス最適化）
    let composite: ImageData;
    if (this.layerManager.getLayerCount() === 1) {
      composite = this.layerManager.composite();
    } else {
      composite = this.layerManager.composite();
    }

    this.renderer.putImageData(composite);
    this.syncActiveLayerCanvas();
  }

  private initSmoother(): void {
    const wasm = getWasm();
    if (wasm?.StrokeSmoother) {
      try {
        this.smoother = new wasm.StrokeSmoother(this.brush.smoothingAlpha, this.brush.smoothingStages);
        this.useWasmSmoothing = true;
        console.log('Wasm stroke smoothing enabled');
      } catch (e) {
        console.warn('Failed to create Wasm smoother:', e);
      }
    }
  }

  private smoothPoint(point: RawPoint): SmoothedPoint {
    let result: SmoothedPoint;
    if (this.useWasmSmoothing && this.smoother) {
      const wasm = getWasm();
      if (wasm) {
        const wasmPoint = new wasm.RawPoint(
          point.x, point.y, point.pressure,
          point.tiltX, point.tiltY, point.timestamp
        );
        const smoothed = this.smoother.process(wasmPoint);
        result = { x: smoothed.x, y: smoothed.y, pressure: smoothed.pressure };
        wasmPoint.free();
        smoothed.free();
      } else {
        result = { x: point.x, y: point.y, pressure: point.pressure };
      }
    } else {
      result = { x: point.x, y: point.y, pressure: point.pressure };
    }

    // Apply pressure curve (gamma) and minimum floor
    const g = this.brush.pressureGamma;
    result.pressure = Math.max(0.1, Math.min(1.0, Math.pow(result.pressure, g)));
    return result;
  }

  private effectiveColor(base: number[], pressure: number): number[] {
    const a = (base[3] ?? 1) * this.brush.opacity * pressure;
    return [base[0], base[1], base[2], a];
  }

  // ---------------------------------------------------------------------------
  // activeLayerCtx 描画ヘルパー（Canvas2DRenderer の描画ロジックと同一）
  // ---------------------------------------------------------------------------

  private drawLineToCtx(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number,
    x2: number, y2: number,
    size: number,
    color: number[]
  ): void {
    ctx.strokeStyle = `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${color[3]})`;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  private drawCircleToCtx(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    radius: number,
    color: number[]
  ): void {
    ctx.fillStyle = `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${color[3]})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // Kubelka-Munk color mixing helpers
  // ---------------------------------------------------------------------------

  /**
   * Sample the average color from activeLayerCtx at (x, y).
   * The sampling area scales with brush radius for consistent behavior.
   * Returns straight RGBA [0,1], or null if the area is fully transparent.
   */
  private sampleCanvasColor(x: number, y: number, brushRadius: number): number[] | null {
    if (!this.activeLayerCtx || !this.activeLayerCanvas) return null;

    const sampleRadius = Math.max(1, Math.min(8, Math.floor(brushRadius * 0.3)));
    const sx = Math.max(0, Math.floor(x) - sampleRadius);
    const sy = Math.max(0, Math.floor(y) - sampleRadius);
    const sw = Math.min(sampleRadius * 2 + 1, this.activeLayerCanvas.width - sx);
    const sh = Math.min(sampleRadius * 2 + 1, this.activeLayerCanvas.height - sy);
    if (sw <= 0 || sh <= 0) return null;

    const imageData = this.activeLayerCtx.getImageData(sx, sy, sw, sh);
    const data = imageData.data;

    let totalR = 0, totalG = 0, totalB = 0, totalA = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255;
      totalR += (data[i] / 255) * a;
      totalG += (data[i + 1] / 255) * a;
      totalB += (data[i + 2] / 255) * a;
      totalA += a;
    }

    if (totalA < 0.01) return null; // area is essentially transparent

    return [totalR / totalA, totalG / totalA, totalB / totalA, totalA / (sw * sh)];
  }

  /**
   * Generate dab positions along a line segment.
   * Mirrors spacing logic in WebGPURenderer.drawLine / Canvas2DRenderer.drawLineDab.
   */
  private generateDabPositions(
    x1: number, y1: number, x2: number, y2: number, size: number
  ): Array<{x: number; y: number; radius: number}> {
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spacing = Math.max(size * 0.25, 1);
    const steps = Math.max(Math.floor(dist / spacing), 1);
    const radius = size * 0.5;

    const dabs: Array<{x: number; y: number; radius: number}> = [];
    for (let i = 0; i < steps; i++) {
      const t = steps === 1 ? 0 : i / (steps - 1);
      dabs.push({ x: x1 + dx * t, y: y1 + dy * t, radius });
    }
    return dabs;
  }

  /**
   * K-M enabled stroke move handler.
   * For each dab: sample canvas color → evolve currentMixedColor → draw.
   */
  private handleStrokeMoveKM(smoothed: SmoothedPoint): void {
    if (!this.lastPoint || !this.currentMixedColor) return;

    const size = this.brush.size * smoothed.pressure;
    const dabs = this.generateDabPositions(
      this.lastPoint.x, this.lastPoint.y, smoothed.x, smoothed.y, size
    );

    const wasm = getWasm();

    for (const dab of dabs) {
      const canvasColor = this.sampleCanvasColor(dab.x, dab.y, dab.radius);

      if (canvasColor && wasm?.km_mix_colors) {
        const mixed = wasm.km_mix_colors(
          this.currentMixedColor[0], this.currentMixedColor[1],
          this.currentMixedColor[2], this.currentMixedColor[3],
          canvasColor[0], canvasColor[1], canvasColor[2], canvasColor[3],
          this.brush.colorMixRate,
        );
        this.currentMixedColor = [mixed[0], mixed[1], mixed[2], mixed[3]];
      }

      const drawColor = this.effectiveColor(this.currentMixedColor, smoothed.pressure);
      this.renderer.drawCircle(dab.x, dab.y, dab.radius, drawColor, this.brush.hardness);

      if (this.activeLayerCtx) {
        this.drawCircleToCtx(this.activeLayerCtx, dab.x, dab.y, dab.radius, drawColor);
      }
    }

    this.renderer.present();
  }

  // ---------------------------------------------------------------------------
  // Stroke handlers
  // ---------------------------------------------------------------------------

  private handleStrokeStart(point: RawPoint): void {
    // Reset smoother for new stroke
    this.smoother?.reset();

    const smoothed = this.smoothPoint(point);
    this.lastPoint = smoothed;

    // レイヤー統合: activeLayerCanvas が未初期化なら同期
    if (this.layerManager && !this.activeLayerCtx) {
      this.syncActiveLayerCanvas();
    }

    // Capture undo snapshot BEFORE drawing
    if (this.undoManager && this.layerManager) {
      this.strokeBeforeSnapshot = this.cloneImageData(
        this.layerManager.getActiveLayerImageData()
      );
    }

    // Draw initial dot
    const size = this.brush.size * smoothed.pressure;
    let dotColor = this.brush.color;

    if (this.brush.colorMixing) {
      this.currentMixedColor = [...this.brush.color];
      const canvasColor = this.sampleCanvasColor(smoothed.x, smoothed.y, size / 2);
      const wasm = getWasm();
      if (canvasColor && wasm?.km_mix_colors) {
        const mixed = wasm.km_mix_colors(
          this.currentMixedColor[0], this.currentMixedColor[1],
          this.currentMixedColor[2], this.currentMixedColor[3],
          canvasColor[0], canvasColor[1], canvasColor[2], canvasColor[3],
          this.brush.colorMixRate,
        );
        this.currentMixedColor = [mixed[0], mixed[1], mixed[2], mixed[3]];
      }
      dotColor = this.currentMixedColor;
    }

    const drawColor = this.effectiveColor(dotColor, smoothed.pressure);
    this.renderer.drawCircle(smoothed.x, smoothed.y, size / 2, drawColor, this.brush.hardness);

    // activeLayerCtx にも同じdotを描画（レイヤー保存用）
    if (this.activeLayerCtx) {
      this.drawCircleToCtx(this.activeLayerCtx, smoothed.x, smoothed.y, size / 2, drawColor);
    }

    this.renderer.present();
  }

  private handleStrokeMove(point: RawPoint): void {
    if (!this.lastPoint) return;

    const smoothed = this.smoothPoint(point);

    if (this.brush.colorMixing && this.currentMixedColor) {
      this.handleStrokeMoveKM(smoothed);
    } else {
      const size = this.brush.size * smoothed.pressure;
      const drawColor = this.effectiveColor(this.brush.color, smoothed.pressure);

      // Draw line from last point to current（表示用）
      this.renderer.drawLine(
        this.lastPoint.x,
        this.lastPoint.y,
        smoothed.x,
        smoothed.y,
        size,
        drawColor,
        this.brush.hardness
      );
      this.renderer.present();

      // activeLayerCtx にも同じラインを描画（レイヤー保存用）
      if (this.activeLayerCtx) {
        this.drawLineToCtx(
          this.activeLayerCtx,
          this.lastPoint.x,
          this.lastPoint.y,
          smoothed.x,
          smoothed.y,
          size,
          drawColor
        );
      }
    }

    this.lastPoint = smoothed;
  }

  private handleStrokeEnd(finalRaw: RawPoint): void {
    // Generate tail dabs to taper the stroke toward the pen-up position
    if (this.lastPoint) {
      const TAIL_STEPS = 4;
      const target = { x: finalRaw.x, y: finalRaw.y, pressure: this.lastPoint.pressure };
      for (let i = 1; i <= TAIL_STEPS; i++) {
        const t = i / TAIL_STEPS;
        const taper = 1 - t;
        const px = this.lastPoint.x + (target.x - this.lastPoint.x) * t;
        const py = this.lastPoint.y + (target.y - this.lastPoint.y) * t;
        const pp = this.lastPoint.pressure * taper;
        const size = this.brush.size * pp;
        if (size < 0.5) break;

        const tailPoint: SmoothedPoint = { x: px, y: py, pressure: pp };

        if (this.brush.colorMixing && this.currentMixedColor) {
          const drawColor = this.effectiveColor(this.currentMixedColor, pp);
          this.renderer.drawCircle(px, py, size / 2, drawColor, this.brush.hardness);
          if (this.activeLayerCtx) {
            this.drawCircleToCtx(this.activeLayerCtx, px, py, size / 2, drawColor);
          }
        } else {
          const drawColor = this.effectiveColor(this.brush.color, pp);
          this.renderer.drawLine(
            this.lastPoint.x, this.lastPoint.y, px, py,
            size, drawColor, this.brush.hardness
          );
          if (this.activeLayerCtx) {
            this.drawLineToCtx(this.activeLayerCtx,
              this.lastPoint.x, this.lastPoint.y, px, py,
              size, drawColor);
          }
        }
        this.lastPoint = tailPoint;
      }
      this.renderer.present();
    }

    // activeLayerCtx の内容を LayerManager に保存する。
    if (this.layerManager && this.activeLayerCtx && this.activeLayerCanvas) {
      const w = this.activeLayerCanvas.width;
      const h = this.activeLayerCanvas.height;
      const data = this.activeLayerCtx.getImageData(0, 0, w, h);
      this.layerManager.setActiveLayerImageData(data);

      // Push undo entry with the before-snapshot
      if (this.undoManager && this.strokeBeforeSnapshot) {
        const info = this.layerManager.getLayerInfo(
          this.layerManager.getActiveLayerIndex()
        );
        if (info) {
          this.undoManager.pushAction({
            layerId: info.id,
            imageData: this.strokeBeforeSnapshot,
          });
        }
        this.strokeBeforeSnapshot = null;
      }
    }

    this.lastPoint = null;
    this.currentMixedColor = null;
  }

  public setColorMixing(enabled: boolean): void {
    this.brush.colorMixing = enabled;
  }

  public setColorMixRate(rate: number): void {
    this.brush.colorMixRate = Math.max(0, Math.min(1, rate));
  }

  public setBrushSize(size: number): void {
    this.brush.size = Math.max(1, Math.min(8192, size));
  }

  public setBrushColor(r: number, g: number, b: number, a = 1): void {
    this.brush.color = [r, g, b, a];
  }

  public setOpacity(v: number): void {
    this.brush.opacity = Math.max(0, Math.min(1, v));
  }

  public setHardness(v: number): void {
    this.brush.hardness = Math.max(0, Math.min(1, v));
  }

  public setPressureGamma(g: number): void {
    this.brush.pressureGamma = Math.max(0.1, Math.min(2.0, g));
  }

  public setSmoothing(alpha: number, stages: number): void {
    this.brush.smoothingAlpha = Math.max(0.01, Math.min(1.0, alpha));
    this.brush.smoothingStages = Math.max(1, Math.min(20, stages));

    if (this.smoother) {
      this.smoother.set_alpha(this.brush.smoothingAlpha);
      this.smoother.set_stages(this.brush.smoothingStages);
    }
  }

  public clear(): void {
    if (this.layerManager) {
      // Capture undo snapshot before clearing
      if (this.undoManager) {
        const snapshot = this.cloneImageData(
          this.layerManager.getActiveLayerImageData()
        );
        const info = this.layerManager.getLayerInfo(
          this.layerManager.getActiveLayerIndex()
        );
        if (snapshot && info) {
          this.undoManager.pushAction({ layerId: info.id, imageData: snapshot });
        }
      }

      // アクティブレイヤーのみをクリア（全レイヤーではない）
      const w = this.layerManager.getWidth();
      const h = this.layerManager.getHeight();
      const blank = new ImageData(w, h); // 透明黒（RGBA all 0）
      // setActiveLayerImageData が onChange → onLayerChanged → recomposite を処理する
      this.layerManager.setActiveLayerImageData(blank);
    } else {
      this.renderer.clear();
    }
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.renderer.resize(width, height);

    // activeLayerCanvas もリサイズ（resetToSize の onChange で syncActiveLayerCanvas が呼ばれる）
    if (this.activeLayerCanvas) {
      this.activeLayerCanvas.width = width;
      this.activeLayerCanvas.height = height;
      this.activeLayerCtx!.clearRect(0, 0, width, height);
    }
  }

  public setBrushTexture(type: BrushTextureType, grainScale?: number): void {
    this.renderer.setBrushTexture?.(type, grainScale);
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public getBrush(): BrushSettings {
    return { ...this.brush };
  }

  public isWasmEnabled(): boolean {
    return this.useWasmSmoothing;
  }

  public destroy(): void {
    this.inputHandler.destroy();
    this.renderer.destroy();
    this.smoother?.free();
  }
}
