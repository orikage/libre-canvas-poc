// WebAssembly module interface
export interface WasmModule {
  version(): string;
  add(a: number, b: number): number;
  log(message: string): void;
  RawPoint: RawPointConstructor;
  SmoothPoint: SmoothPointConstructor;
  StrokeSmoother: StrokeSmootherConstructor;
  km_mix_colors(
    a_r: number, a_g: number, a_b: number, a_a: number,
    b_r: number, b_g: number, b_b: number, b_a: number,
    mix_ratio: number,
  ): Float32Array;
}

export interface RawPointConstructor {
  new (x: number, y: number, pressure: number, tiltX: number, tiltY: number, timestamp: number): RawPoint;
}

export interface RawPoint {
  x: number;
  y: number;
  pressure: number;
  tilt_x: number;
  tilt_y: number;
  timestamp: number;
  free(): void;
}

export interface SmoothPointConstructor {
  new (x: number, y: number, pressure: number): SmoothPoint;
}

export interface SmoothPoint {
  x: number;
  y: number;
  pressure: number;
  tilt_x: number;
  tilt_y: number;
  free(): void;
}

export interface StrokeSmootherConstructor {
  new (alpha: number, stages: number): StrokeSmoother;
  sai_like(): StrokeSmoother;
}

export interface StrokeSmoother {
  process(input: RawPoint): SmoothPoint;
  reset(): void;
  set_alpha(alpha: number): void;
  set_stages(stages: number): void;
  get_alpha(): number;
  get_stages(): number;
  free(): void;
}

let wasmModule: WasmModule | null = null;

export async function initWasm(): Promise<WasmModule | null> {
  if (wasmModule) {
    return wasmModule;
  }

  try {
    // Import the wasm-bindgen generated module and initialize the WASM binary
    const module = await import('./pkg/libre_canvas_core');
    await module.default(); // calls __wbg_init() to load and instantiate the .wasm binary
    wasmModule = module as unknown as WasmModule;
    return wasmModule;
  } catch (error) {
    console.warn('Failed to load WebAssembly module:', error);
    console.warn('Running without Wasm support (development mode)');
    return null;
  }
}

export function getWasm(): WasmModule | null {
  return wasmModule;
}
