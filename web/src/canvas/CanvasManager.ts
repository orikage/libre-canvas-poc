import { InputHandler, RawPoint } from './InputHandler';
import { Renderer, BrushTextureType, createRenderer } from '../renderer/Renderer';
import { getWasm, StrokeSmoother } from '../wasm/wasmLoader';

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

  private handleStrokeStart(point: RawPoint): void {
    // Reset smoother for new stroke
    this.smoother?.reset();

    const smoothed = this.smoothPoint(point);
    this.lastPoint = smoothed;

    // Draw initial dot
    const size = this.brush.size * smoothed.pressure;
    this.renderer.drawCircle(smoothed.x, smoothed.y, size / 2, this.brush.color);
    this.renderer.present();
  }

  private handleStrokeMove(point: RawPoint): void {
    if (!this.lastPoint) return;

    const smoothed = this.smoothPoint(point);
    const size = this.brush.size * smoothed.pressure;

    // Draw line from last point to current
    this.renderer.drawLine(
      this.lastPoint.x,
      this.lastPoint.y,
      smoothed.x,
      smoothed.y,
      size,
      this.brush.color
    );
    this.renderer.present();

    this.lastPoint = smoothed;
  }

  private handleStrokeEnd(): void {
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
    this.renderer.clear();
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.renderer.resize(width, height);
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
