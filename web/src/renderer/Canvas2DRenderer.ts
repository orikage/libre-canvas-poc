import { Renderer, BrushTextureType } from './Renderer';
import { pencilGrain, charcoalGrain, DEFAULT_GRAIN_SCALE } from './grainTexture';

/**
 * Canvas2D-based renderer.
 *
 * Uses an offscreen canvas for drawing with the Canvas 2D API.
 * This is the primary renderer for the POC phase.
 */
export class Canvas2DRenderer implements Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;

  // ブラシテクスチャ設定
  private brushType: BrushTextureType = 'round';
  private grainScale: number = DEFAULT_GRAIN_SCALE.round;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Canvas 2D context not supported');
    }
    this.ctx = ctx;

    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = canvas.width;
    this.offscreenCanvas.height = canvas.height;

    const offscreenCtx = this.offscreenCanvas.getContext('2d', { alpha: false });
    if (!offscreenCtx) {
      throw new Error('Offscreen canvas 2D context not supported');
    }
    this.offscreenCtx = offscreenCtx;

    // Initialize with white background
    this.offscreenCtx.fillStyle = 'white';
    this.offscreenCtx.fillRect(0, 0, canvas.width, canvas.height);
    this.present();
  }

  getType(): 'canvas2d' | 'webgpu' {
    return 'canvas2d';
  }

  /**
   * ブラシテクスチャを設定する。
   * - round: 通常の円形ブラシ（デフォルト）
   * - pencil: 鉛筆風グレイン（細かい多重オクターブノイズ）
   * - charcoal: 木炭風グレイン（粗いコントラスト強めのノイズ）
   *
   * pencil / charcoal 時は drawLine / drawCircle が dab-based stippling に切り替わり、
   * 各 dab 位置の grain 値でアルファを変調して描画する。
   */
  setBrushTexture(type: BrushTextureType, grainScale?: number): void {
    this.brushType = type;
    this.grainScale = grainScale ?? DEFAULT_GRAIN_SCALE[type];
  }

  clear(): void {
    this.offscreenCtx.fillStyle = 'white';
    this.offscreenCtx.fillRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
    this.present();
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, size: number, color: number[], _hardness?: number): void {
    if (this.brushType === 'round') {
      this.drawLineRound(x1, y1, x2, y2, size, color);
    } else {
      this.drawLineDab(x1, y1, x2, y2, size, color);
    }
  }

  drawCircle(x: number, y: number, radius: number, color: number[], _hardness?: number): void {
    if (this.brushType === 'round') {
      this.drawCircleRound(x, y, radius, color);
    } else {
      this.drawCircleDab(x, y, radius, color);
    }
  }

  // ---------------------------------------------------------------------------
  // round ブラシ（既存ロジック）
  // ---------------------------------------------------------------------------

  private drawLineRound(x1: number, y1: number, x2: number, y2: number, size: number, color: number[]): void {
    const ctx = this.offscreenCtx;
    ctx.strokeStyle = `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${color[3]})`;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  private drawCircleRound(x: number, y: number, radius: number, color: number[]): void {
    const ctx = this.offscreenCtx;
    ctx.fillStyle = `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${color[3]})`;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // grain ブラシ（dab-based stippling）
  //
  // 各 dab 位置でキャンバス座標を grainScale で割り、grain 関数からアルファ値を取得する。
  // これにより WebGPU シェーダーの `fract(world_pos / grain_scale)` と同等の
  // ワールド座標アンカーなグレイン模様を再現する。
  // ---------------------------------------------------------------------------

  private grainAt(x: number, y: number): number {
    const nx = (x / this.grainScale) % 1;
    const ny = (y / this.grainScale) % 1;
    return this.brushType === 'pencil'
      ? pencilGrain(nx, ny)
      : charcoalGrain(nx, ny);
  }

  private drawLineDab(x1: number, y1: number, x2: number, y2: number, size: number, color: number[]): void {
    const ctx = this.offscreenCtx;
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const spacing = Math.max(size * 0.25, 1);
    const steps = Math.max(1, Math.ceil(dist / spacing));
    const r = Math.round(color[0] * 255);
    const g = Math.round(color[1] * 255);
    const b = Math.round(color[2] * 255);
    const baseAlpha = color[3];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = x1 + (x2 - x1) * t;
      const cy = y1 + (y2 - y1) * t;
      const grain = this.grainAt(cx, cy);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${grain * baseAlpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCircleDab(x: number, y: number, radius: number, color: number[]): void {
    const ctx = this.offscreenCtx;
    const grain = this.grainAt(x, y);
    ctx.fillStyle = `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${grain * color[3]})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  present(): void {
    this.ctx.drawImage(this.offscreenCanvas, 0, 0);
  }

  resize(width: number, height: number): void {
    // Preserve content
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.offscreenCanvas.width;
    tempCanvas.height = this.offscreenCanvas.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.drawImage(this.offscreenCanvas, 0, 0);

    // Resize
    this.canvas.width = width;
    this.canvas.height = height;
    this.offscreenCanvas.width = width;
    this.offscreenCanvas.height = height;

    // Restore
    this.offscreenCtx.fillStyle = 'white';
    this.offscreenCtx.fillRect(0, 0, width, height);
    this.offscreenCtx.drawImage(tempCanvas, 0, 0);
    this.present();
  }

  getImageData(): ImageData {
    return this.offscreenCtx.getImageData(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
  }

  putImageData(data: ImageData): void {
    this.offscreenCtx.putImageData(data, 0, 0);
    this.present();
  }

  destroy(): void {
    // Nothing to clean up
  }
}
