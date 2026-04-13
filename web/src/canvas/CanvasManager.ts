import { InputHandler, RawPoint } from './InputHandler';
import { Renderer, BrushTextureType, createRenderer } from '../renderer/Renderer';
import { getWasm, StrokeSmoother } from '../wasm/wasmLoader';
import { LayerManager } from '../layer/LayerManager';
import { UndoManager } from '../history/UndoManager';

export interface BrushSettings {
  size: number;
  color: number[]; // [r, g, b, a] normalized 0-1
  smoothingAlpha: number;
  smoothingStages: number;
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

  // Undo/Redo
  private undoManager: UndoManager | null = null;
  private strokeBeforeSnapshot: ImageData | null = null;

  private constructor(canvas: HTMLCanvasElement, renderer: Renderer) {
    this.canvas = canvas;
    this.renderer = renderer;

    this.brush = {
      size: 10,
      color: [0, 0, 0, 1], // Black
      smoothingAlpha: 0.4,
      smoothingStages: 3,
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
    if (this.useWasmSmoothing && this.smoother) {
      const wasm = getWasm();
      if (wasm) {
        const wasmPoint = new wasm.RawPoint(
          point.x, point.y, point.pressure,
          point.tiltX, point.tiltY, point.timestamp
        );
        const smoothed = this.smoother.process(wasmPoint);
        const result = { x: smoothed.x, y: smoothed.y, pressure: smoothed.pressure };
        wasmPoint.free();
        smoothed.free();
        return result;
      }
    }

    // Fallback: no smoothing
    return { x: point.x, y: point.y, pressure: point.pressure };
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
    this.renderer.drawCircle(smoothed.x, smoothed.y, size / 2, this.brush.color);

    // activeLayerCtx にも同じdotを描画（レイヤー保存用）
    if (this.activeLayerCtx) {
      this.drawCircleToCtx(this.activeLayerCtx, smoothed.x, smoothed.y, size / 2, this.brush.color);
    }

    this.renderer.present();
  }

  private handleStrokeMove(point: RawPoint): void {
    if (!this.lastPoint) return;

    const smoothed = this.smoothPoint(point);
    const size = this.brush.size * smoothed.pressure;

    // Draw line from last point to current（表示用）
    this.renderer.drawLine(
      this.lastPoint.x,
      this.lastPoint.y,
      smoothed.x,
      smoothed.y,
      size,
      this.brush.color
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
        this.brush.color
      );
    }

    this.lastPoint = smoothed;
  }

  private handleStrokeEnd(): void {
    // activeLayerCtx の内容を LayerManager に保存する。
    // setActiveLayerImageData が内部で onChange を発火し、
    // onLayerChanged() が composite → renderer.putImageData → syncActiveLayerCanvas を処理する。
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
  }

  public setBrushSize(size: number): void {
    this.brush.size = Math.max(1, Math.min(8192, size));
  }

  public setBrushColor(r: number, g: number, b: number, a = 1): void {
    this.brush.color = [r, g, b, a];
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
