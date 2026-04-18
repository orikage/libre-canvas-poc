/**
 * Renderer interface for canvas rendering.
 *
 * Supports both Canvas2D and WebGPU backends.
 */
export interface Renderer {
  /**
   * Clear the entire canvas to background color
   */
  clear(): void;

  /**
   * Draw a line between two points
   */
  drawLine(x1: number, y1: number, x2: number, y2: number, size: number, color: number[], hardness?: number): void;

  /**
   * Draw a filled circle
   */
  drawCircle(x: number, y: number, radius: number, color: number[], hardness?: number): void;

  /**
   * Present the rendered content to the display
   */
  present(): void;

  /**
   * Resize the canvas
   */
  resize(width: number, height: number): void;

  /**
   * Get the current image data
   */
  getImageData(): ImageData;

  /**
   * Set image data
   */
  putImageData(data: ImageData): void;

  /**
   * Clean up resources
   */
  destroy(): void;

  /**
   * Get renderer type identifier
   */
  getType(): 'canvas2d' | 'webgpu';

  /**
   * Set brush texture type (WebGPU only; Canvas2D ignores this)
   */
  setBrushTexture?(type: BrushTextureType, grainScale?: number): void;
}

export type BrushTextureType = 'round' | 'pencil' | 'charcoal';

/**
 * Check if WebGPU is available in the current browser.
 *
 * Uses `as unknown as { gpu: GPU }` to avoid relying on navigator.gpu
 * being typed in the ambient lib (older TS / strict-lib setups).
 */
export async function isWebGPUAvailable(): Promise<boolean> {
  if (!('gpu' in navigator)) {
    return false;
  }

  try {
    const adapter = await (navigator as unknown as { gpu: GPU }).gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * Create the best available renderer for the given canvas.
 *
 * Attempts WebGPU first; falls back to Canvas2D when WebGPU is unavailable
 * or when WebGPURenderer.create() returns null (e.g. device-lost on creation).
 */
export async function createRenderer(canvas: HTMLCanvasElement): Promise<Renderer> {
  if (await isWebGPUAvailable()) {
    const { WebGPURenderer } = await import('./WebGPURenderer');
    const webgpu = await WebGPURenderer.create(canvas);
    if (webgpu !== null) {
      return webgpu;
    }
  }

  const { Canvas2DRenderer } = await import('./Canvas2DRenderer');
  return new Canvas2DRenderer(canvas);
}
