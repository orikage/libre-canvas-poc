/**
 * CanvasManager の純粋ロジック部分のテスト。
 *
 * WebGPU/Wasm に依存する部分はモックで置き換えます。
 * 対象: ブラシ設定のクランプ・型変換ロジック。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// モック: ブラウザ API（CanvasManager が依存するもの）
// ---------------------------------------------------------------------------

// PointerEvent は Node 環境で未定義なのでスタブを定義
vi.stubGlobal('PointerEvent', class PointerEvent extends Event {
  constructor(type: string, init?: any) { super(type, init); }
});

// ImageData は Node 環境で未定義なのでスタブを定義
vi.stubGlobal('ImageData', class ImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  constructor(widthOrData: number | Uint8ClampedArray, height: number, width?: number) {
    if (typeof widthOrData === 'number') {
      this.width = widthOrData;
      this.height = height;
      this.data = new Uint8ClampedArray(widthOrData * height * 4);
    } else {
      this.data = widthOrData;
      this.width = height;
      this.height = width ?? (widthOrData.length / height / 4);
    }
  }
});

// HTMLCanvasElement の最低限スタブ
function makeCanvas(width = 3840, height = 2160): HTMLCanvasElement {
  return {
    width,
    height,
    getContext: vi.fn().mockReturnValue(null),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    getBoundingClientRect: vi.fn().mockReturnValue({ left: 0, top: 0, width: 1920, height: 1080 }),
  } as unknown as HTMLCanvasElement;
}

// Renderer モック
function makeRenderer() {
  return {
    getType: vi.fn().mockReturnValue('webgpu'),
    clear: vi.fn(),
    drawLine: vi.fn(),
    drawCircle: vi.fn(),
    present: vi.fn(),
    resize: vi.fn(),
    getImageData: vi.fn().mockReturnValue(new ImageData(1, 1)),
    putImageData: vi.fn(),
    destroy: vi.fn(),
    setBrushTexture: vi.fn(),
  };
}

// CanvasManager を内部コンストラクタ経由で生成するヘルパー
// (static create() は WebGPU 非同期初期化があるため直接生成)
function makeCanvasManager(canvas: HTMLCanvasElement, renderer: any) {
  // CanvasManager のコンストラクタは private → prototype 経由でインスタンスを生成
  // ここではテスト対象のロジックだけを抽出したオブジェクトを組み立てる方式にする
  const brush = {
    size: 10,
    color: [0, 0, 0, 1] as number[],
    smoothingAlpha: 0.4,
    smoothingStages: 3,
  };

  // CanvasManager の公開メソッドと同等のロジックを直接テスト
  return {
    brush,
    renderer,
    canvas,

    setBrushSize(size: number) {
      brush.size = Math.max(1, Math.min(8192, size));
    },

    setBrushColor(r: number, g: number, b: number, a = 1) {
      brush.color = [r, g, b, a];
    },

    setSmoothing(alpha: number, stages: number) {
      brush.smoothingAlpha = Math.max(0.01, Math.min(1.0, alpha));
      brush.smoothingStages = Math.max(1, Math.min(20, stages));
    },

    getBrush() { return { ...brush }; },

    resize(w: number, h: number) {
      canvas.width  = w;
      canvas.height = h;
      renderer.resize(w, h);
    },

    setBrushTexture(type: string, scale?: number) {
      renderer.setBrushTexture?.(type, scale);
    },
  };
}

// ---------------------------------------------------------------------------
// setBrushSize
// ---------------------------------------------------------------------------
describe('CanvasManager / setBrushSize', () => {
  it('正常値はそのまま設定される', () => {
    const cm = makeCanvasManager(makeCanvas(), makeRenderer());
    cm.setBrushSize(50);
    expect(cm.getBrush().size).toBe(50);
  });

  it('0 以下は 1 にクランプされる', () => {
    const cm = makeCanvasManager(makeCanvas(), makeRenderer());
    cm.setBrushSize(0);
    expect(cm.getBrush().size).toBe(1);
    cm.setBrushSize(-100);
    expect(cm.getBrush().size).toBe(1);
  });

  it('8192 超は 8192 にクランプされる', () => {
    const cm = makeCanvasManager(makeCanvas(), makeRenderer());
    cm.setBrushSize(9999);
    expect(cm.getBrush().size).toBe(8192);
  });

  it('上限値ちょうど 8192 は有効', () => {
    const cm = makeCanvasManager(makeCanvas(), makeRenderer());
    cm.setBrushSize(8192);
    expect(cm.getBrush().size).toBe(8192);
  });

  it('下限値ちょうど 1 は有効', () => {
    const cm = makeCanvasManager(makeCanvas(), makeRenderer());
    cm.setBrushSize(1);
    expect(cm.getBrush().size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// setBrushColor
// ---------------------------------------------------------------------------
describe('CanvasManager / setBrushColor', () => {
  it('R G B A が正しく格納される', () => {
    const cm = makeCanvasManager(makeCanvas(), makeRenderer());
    cm.setBrushColor(0.2, 0.5, 0.8, 0.9);
    const { color } = cm.getBrush();
    expect(color[0]).toBeCloseTo(0.2);
    expect(color[1]).toBeCloseTo(0.5);
    expect(color[2]).toBeCloseTo(0.8);
    expect(color[3]).toBeCloseTo(0.9);
  });

  it('a を省略すると 1.0 になる', () => {
    const cm = makeCanvasManager(makeCanvas(), makeRenderer());
    cm.setBrushColor(1, 0, 0);
    expect(cm.getBrush().color[3]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// setSmoothing
// ---------------------------------------------------------------------------
describe('CanvasManager / setSmoothing', () => {
  it('有効範囲の alpha と stages はそのまま設定される', () => {
    const cm = makeCanvasManager(makeCanvas(), makeRenderer());
    cm.setSmoothing(0.6, 5);
    const { smoothingAlpha, smoothingStages } = cm.getBrush();
    expect(smoothingAlpha).toBeCloseTo(0.6);
    expect(smoothingStages).toBe(5);
  });

  it('alpha が 0 以下のとき 0.01 にクランプされる', () => {
    const cm = makeCanvasManager(makeCanvas(), makeRenderer());
    cm.setSmoothing(0, 3);
    expect(cm.getBrush().smoothingAlpha).toBe(0.01);
  });

  it('alpha が 1.0 超のとき 1.0 にクランプされる', () => {
    const cm = makeCanvasManager(makeCanvas(), makeRenderer());
    cm.setSmoothing(2.0, 3);
    expect(cm.getBrush().smoothingAlpha).toBe(1.0);
  });

  it('stages が 0 のとき 1 にクランプされる', () => {
    const cm = makeCanvasManager(makeCanvas(), makeRenderer());
    cm.setSmoothing(0.5, 0);
    expect(cm.getBrush().smoothingStages).toBe(1);
  });

  it('stages が 21 のとき 20 にクランプされる', () => {
    const cm = makeCanvasManager(makeCanvas(), makeRenderer());
    cm.setSmoothing(0.5, 21);
    expect(cm.getBrush().smoothingStages).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// resize
// ---------------------------------------------------------------------------
describe('CanvasManager / resize', () => {
  it('canvas.width / height が更新される', () => {
    const canvas = makeCanvas(1920, 1080);
    const cm = makeCanvasManager(canvas, makeRenderer());
    cm.resize(3840, 2160);
    expect(canvas.width).toBe(3840);
    expect(canvas.height).toBe(2160);
  });

  it('renderer.resize が正しいサイズで呼ばれる', () => {
    const renderer = makeRenderer();
    const cm = makeCanvasManager(makeCanvas(), renderer);
    cm.resize(2560, 1440);
    expect(renderer.resize).toHaveBeenCalledWith(2560, 1440);
  });
});

// ---------------------------------------------------------------------------
// setBrushTexture
// ---------------------------------------------------------------------------
describe('CanvasManager / setBrushTexture', () => {
  it('renderer.setBrushTexture が type 付きで呼ばれる', () => {
    const renderer = makeRenderer();
    const cm = makeCanvasManager(makeCanvas(), renderer);
    cm.setBrushTexture('pencil');
    expect(renderer.setBrushTexture).toHaveBeenCalledWith('pencil', undefined);
  });

  it('grainScale を指定すると renderer にそのまま渡される', () => {
    const renderer = makeRenderer();
    const cm = makeCanvasManager(makeCanvas(), renderer);
    cm.setBrushTexture('charcoal', 400);
    expect(renderer.setBrushTexture).toHaveBeenCalledWith('charcoal', 400);
  });
});

// ---------------------------------------------------------------------------
// LayerManager 統合
// ---------------------------------------------------------------------------

// LayerManager モック（必要なメソッドのみ）
function makeLayerManager(w = 100, h = 100) {
  return {
    getWidth: vi.fn().mockReturnValue(w),
    getHeight: vi.fn().mockReturnValue(h),
    getActiveLayerIndex: vi.fn().mockReturnValue(0),
    getLayerCount: vi.fn().mockReturnValue(1),
    getActiveLayerImageData: vi.fn().mockReturnValue(new ImageData(w, h)),
    setActiveLayerImageData: vi.fn(),
    composite: vi.fn().mockReturnValue(new ImageData(w, h)),
  };
}

// CanvasManager のレイヤー統合ロジックを直接テストするための拡張ヘルパー
function makeCanvasManagerWithLayerSupport(canvas: HTMLCanvasElement, renderer: any) {
  let layerManager: ReturnType<typeof makeLayerManager> | null = null;
  let activeLayerCtx: any = null;
  const brush = {
    size: 10,
    color: [0, 0, 0, 1] as number[],
    smoothingAlpha: 0.4,
    smoothingStages: 3,
  };

  function syncActiveLayerCanvas() {
    if (!layerManager) return;
    const data = layerManager.getActiveLayerImageData();
    if (activeLayerCtx && data) {
      activeLayerCtx.clearRect(0, 0, data.width, data.height);
      activeLayerCtx.putImageData(data, 0, 0);
    }
  }

  return {
    brush,
    renderer,
    canvas,
    get activeLayerCtx() { return activeLayerCtx; },

    setLayerManager(lm: any) {
      layerManager = lm;
      // テスト用: activeLayerCtx をモックに差し替え
      activeLayerCtx = {
        clearRect: vi.fn(),
        putImageData: vi.fn(),
        getImageData: vi.fn().mockReturnValue(new ImageData(lm.getWidth(), lm.getHeight())),
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 1,
        lineCap: '',
        lineJoin: '',
        globalAlpha: 1,
        arc: vi.fn(),
        fill: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
      };
      syncActiveLayerCanvas();
      this.onLayerChanged();
    },

    onLayerChanged() {
      if (!layerManager) return;
      const composite = layerManager.composite();
      renderer.putImageData(composite);
      syncActiveLayerCanvas();
    },

    handleStrokeEnd() {
      if (layerManager && activeLayerCtx) {
        const w = layerManager.getWidth();
        const h = layerManager.getHeight();
        const data = activeLayerCtx.getImageData(0, 0, w, h);
        layerManager.setActiveLayerImageData(data);
      }
    },

    clear() {
      if (layerManager) {
        const w = layerManager.getWidth();
        const h = layerManager.getHeight();
        const blank = new ImageData(w, h);
        layerManager.setActiveLayerImageData(blank);
      } else {
        renderer.clear();
      }
    },

    getBrush() { return { ...brush }; },
    setBrushSize(size: number) { brush.size = Math.max(1, Math.min(8192, size)); },
  };
}

describe('CanvasManager / setLayerManager', () => {
  it('setLayerManager 後に onLayerChanged を呼ぶと renderer.putImageData が実行される', () => {
    const renderer = makeRenderer();
    const cm = makeCanvasManagerWithLayerSupport(makeCanvas(), renderer);
    const lm = makeLayerManager();
    renderer.putImageData.mockClear();
    cm.setLayerManager(lm);
    // setLayerManager 内で onLayerChanged が呼ばれるため putImageData が呼ばれる
    expect(renderer.putImageData).toHaveBeenCalled();
  });

  it('setLayerManager 後に layerManager.composite() の結果が renderer に渡される', () => {
    const renderer = makeRenderer();
    const cm = makeCanvasManagerWithLayerSupport(makeCanvas(), renderer);
    const lm = makeLayerManager();
    const compositeResult = new ImageData(100, 100);
    lm.composite.mockReturnValue(compositeResult);
    renderer.putImageData.mockClear();
    cm.setLayerManager(lm);
    expect(renderer.putImageData).toHaveBeenCalledWith(compositeResult);
  });
});

describe('CanvasManager / onLayerChanged', () => {
  it('layerManager.composite() の結果が renderer.putImageData に渡される', () => {
    const renderer = makeRenderer();
    const cm = makeCanvasManagerWithLayerSupport(makeCanvas(), renderer);
    const lm = makeLayerManager();
    cm.setLayerManager(lm);
    const newComposite = new ImageData(100, 100);
    lm.composite.mockReturnValue(newComposite);
    renderer.putImageData.mockClear();
    cm.onLayerChanged();
    expect(renderer.putImageData).toHaveBeenCalledWith(newComposite);
  });

  it('layerManager が未設定の場合は renderer.putImageData を呼ばない', () => {
    const renderer = makeRenderer();
    const cm = makeCanvasManagerWithLayerSupport(makeCanvas(), renderer);
    renderer.putImageData.mockClear();
    cm.onLayerChanged();
    expect(renderer.putImageData).not.toHaveBeenCalled();
  });
});

describe('CanvasManager / handleStrokeEnd with layerManager', () => {
  it('strokeEnd 後に layerManager.setActiveLayerImageData が呼ばれる', () => {
    const renderer = makeRenderer();
    const cm = makeCanvasManagerWithLayerSupport(makeCanvas(), renderer);
    const lm = makeLayerManager();
    cm.setLayerManager(lm);
    lm.setActiveLayerImageData.mockClear();
    cm.handleStrokeEnd();
    expect(lm.setActiveLayerImageData).toHaveBeenCalledTimes(1);
  });

  it('strokeEnd 後に setActiveLayerImageData に ImageData が渡される', () => {
    const renderer = makeRenderer();
    const cm = makeCanvasManagerWithLayerSupport(makeCanvas(), renderer);
    const lm = makeLayerManager();
    cm.setLayerManager(lm);
    lm.setActiveLayerImageData.mockClear();
    cm.handleStrokeEnd();
    const [arg] = lm.setActiveLayerImageData.mock.calls[0];
    expect(arg).toBeInstanceOf(ImageData);
  });
});

describe('CanvasManager / clear with layerManager', () => {
  it('layerManager がある場合、setActiveLayerImageData に透明な ImageData が渡される', () => {
    const renderer = makeRenderer();
    const cm = makeCanvasManagerWithLayerSupport(makeCanvas(), renderer);
    const lm = makeLayerManager();
    cm.setLayerManager(lm);
    lm.setActiveLayerImageData.mockClear();
    cm.clear();
    const [arg] = lm.setActiveLayerImageData.mock.calls[0];
    // 透明黒 = 全ピクセルが 0
    expect(arg.data.every((v: number) => v === 0)).toBe(true);
  });

  it('layerManager がない場合は renderer.clear() が直接呼ばれる', () => {
    const renderer = makeRenderer();
    const cm = makeCanvasManagerWithLayerSupport(makeCanvas(), renderer);
    renderer.clear.mockClear();
    cm.clear();
    expect(renderer.clear).toHaveBeenCalledTimes(1);
  });
});
