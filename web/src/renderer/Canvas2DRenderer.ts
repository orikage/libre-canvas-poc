import { Renderer } from './Renderer';

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

  clear(): void {
    this.offscreenCtx.fillStyle = 'white';
    this.offscreenCtx.fillRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
    this.present();
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, size: number, color: number[]): void {
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

  drawCircle(x: number, y: number, radius: number, color: number[]): void {
    const ctx = this.offscreenCtx;
    ctx.fillStyle = `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${color[3]})`;

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
