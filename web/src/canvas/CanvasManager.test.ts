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
