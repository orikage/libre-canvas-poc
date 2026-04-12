/**
 * Canvas2DRenderer のテスト。
 *
 * ブラウザの Canvas 2D API を vi.fn() でモックし、Node.js 環境で実行可能にする。
 * 対象: setBrushTexture による描画モード切替、drawLine / drawCircle の呼び出しパターン。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Canvas2DRenderer } from './Canvas2DRenderer';

// ---------------------------------------------------------------------------
// ブラウザ API スタブ
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ヘルパー: Canvas2DRenderer をモックコンテキストで生成する
// ---------------------------------------------------------------------------

/**
 * Canvas2DRenderer を生成するためのモックキャンバスと 2D コンテキストを返す。
 * Canvas2DRenderer は内部で document.createElement('canvas') を呼ぶため、
 * document をスタブして同じモックコンテキストを返すようにする。
 */
function makeCanvas2DWithMockCtx(width = 100, height = 100) {
  const ctx = {
    fillStyle: '' as string | CanvasPattern | CanvasGradient,
    strokeStyle: '' as string | CanvasPattern | CanvasGradient,
    globalAlpha: 1,
    lineWidth: 0,
    lineCap: '' as CanvasLineCap,
    lineJoin: '' as CanvasLineJoin,
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue(new ImageData(width, height)),
    putImageData: vi.fn(),
  };

  // offscreenCanvas 用モック（document.createElement('canvas') が返すオブジェクト）
  const offscreenCanvas = {
    width,
    height,
    getContext: vi.fn().mockReturnValue(ctx),
  };

  // Canvas2DRenderer は constructor 内で document.createElement('canvas') を 1 回呼ぶ
  vi.stubGlobal('document', {
    createElement: vi.fn().mockReturnValue(offscreenCanvas),
  });

  const canvas = {
    width,
    height,
    getContext: vi.fn().mockReturnValue(ctx),
  } as unknown as HTMLCanvasElement;

  return { canvas, ctx };
}

// ---------------------------------------------------------------------------
// getType
// ---------------------------------------------------------------------------

describe('Canvas2DRenderer / getType', () => {
  it('"canvas2d" を返す', () => {
    const { canvas } = makeCanvas2DWithMockCtx();
    const renderer = new Canvas2DRenderer(canvas);
    expect(renderer.getType()).toBe('canvas2d');
  });
});

// ---------------------------------------------------------------------------
// drawLine — round ブラシ
// ---------------------------------------------------------------------------

describe('Canvas2DRenderer / drawLine (round)', () => {
  it('stroke() が 1 回呼ばれる', () => {
    const { canvas, ctx } = makeCanvas2DWithMockCtx();
    const renderer = new Canvas2DRenderer(canvas);
    ctx.stroke.mockClear();
    renderer.drawLine(0, 0, 10, 10, 4, [0, 0, 0, 1]);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('strokeStyle が rgba 形式で設定される', () => {
    const { canvas, ctx } = makeCanvas2DWithMockCtx();
    const renderer = new Canvas2DRenderer(canvas);
    renderer.drawLine(0, 0, 10, 10, 4, [1, 0, 0, 1]);
    expect(ctx.strokeStyle).toContain('255');  // R=255
  });

  it('lineCap が "round" に設定される', () => {
    const { canvas, ctx } = makeCanvas2DWithMockCtx();
    const renderer = new Canvas2DRenderer(canvas);
    renderer.drawLine(0, 0, 10, 10, 4, [0, 0, 0, 1]);
    expect(ctx.lineCap).toBe('round');
  });

  it('fill() は呼ばれない（stroke ベース）', () => {
    const { canvas, ctx } = makeCanvas2DWithMockCtx();
    const renderer = new Canvas2DRenderer(canvas);
    ctx.fill.mockClear();
    renderer.drawLine(0, 0, 10, 10, 4, [0, 0, 0, 1]);
    expect(ctx.fill).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// drawLine — pencil ブラシ（dab-based stippling）
// ---------------------------------------------------------------------------

describe('Canvas2DRenderer / drawLine (pencil)', () => {
  it('setBrushTexture("pencil") 後の drawLine で fill() が複数回呼ばれる（dab ベース）', () => {
    const { canvas, ctx } = makeCanvas2DWithMockCtx();
    const renderer = new Canvas2DRenderer(canvas);
    renderer.setBrushTexture('pencil');
    ctx.fill.mockClear();
    renderer.drawLine(0, 0, 50, 0, 4, [0, 0, 0, 1]);
    // spacing = size * 0.25 = 1, steps = 50 → 51 回以上のdab
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.fill.mock.calls.length).toBeGreaterThan(1);
  });

  it('pencil 時は stroke() が呼ばれない', () => {
    const { canvas, ctx } = makeCanvas2DWithMockCtx();
    const renderer = new Canvas2DRenderer(canvas);
    renderer.setBrushTexture('pencil');
    ctx.stroke.mockClear();
    renderer.drawLine(0, 0, 10, 0, 4, [0, 0, 0, 1]);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// drawLine — charcoal ブラシ
// ---------------------------------------------------------------------------

describe('Canvas2DRenderer / drawLine (charcoal)', () => {
  it('setBrushTexture("charcoal") 後の drawLine で fill() が複数回呼ばれる', () => {
    const { canvas, ctx } = makeCanvas2DWithMockCtx();
    const renderer = new Canvas2DRenderer(canvas);
    renderer.setBrushTexture('charcoal');
    ctx.fill.mockClear();
    renderer.drawLine(0, 0, 40, 0, 4, [0, 0, 0, 1]);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.fill.mock.calls.length).toBeGreaterThan(1);
  });

  it('charcoal 時は stroke() が呼ばれない', () => {
    const { canvas, ctx } = makeCanvas2DWithMockCtx();
    const renderer = new Canvas2DRenderer(canvas);
    renderer.setBrushTexture('charcoal');
    ctx.stroke.mockClear();
    renderer.drawLine(0, 0, 10, 0, 4, [0, 0, 0, 1]);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// drawCircle
// ---------------------------------------------------------------------------

describe('Canvas2DRenderer / drawCircle (round)', () => {
  it('fill() が 1 回呼ばれる', () => {
    const { canvas, ctx } = makeCanvas2DWithMockCtx();
    const renderer = new Canvas2DRenderer(canvas);
    ctx.fill.mockClear();
    renderer.drawCircle(50, 50, 5, [0, 0, 0, 1]);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });
});

describe('Canvas2DRenderer / drawCircle (pencil)', () => {
  it('fill() が 1 回呼ばれる（grain でアルファ変調したdab 1 つ）', () => {
    const { canvas, ctx } = makeCanvas2DWithMockCtx();
    const renderer = new Canvas2DRenderer(canvas);
    renderer.setBrushTexture('pencil');
    ctx.fill.mockClear();
    renderer.drawCircle(50, 50, 5, [0, 0, 0, 1]);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// setBrushTexture — round に戻す
// ---------------------------------------------------------------------------

describe('Canvas2DRenderer / setBrushTexture (round への復帰)', () => {
  it('pencil から round に変更すると drawLine で stroke() が使われる', () => {
    const { canvas, ctx } = makeCanvas2DWithMockCtx();
    const renderer = new Canvas2DRenderer(canvas);
    renderer.setBrushTexture('pencil');
    renderer.setBrushTexture('round');
    ctx.stroke.mockClear();
    ctx.fill.mockClear();
    renderer.drawLine(0, 0, 10, 10, 4, [0, 0, 0, 1]);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.fill).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getImageData
// ---------------------------------------------------------------------------

describe('Canvas2DRenderer / getImageData', () => {
  it('offscreenCtx.getImageData を呼ぶ', () => {
    const { canvas, ctx } = makeCanvas2DWithMockCtx();
    const renderer = new Canvas2DRenderer(canvas);
    ctx.getImageData.mockClear();
    renderer.getImageData();
    expect(ctx.getImageData).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// putImageData
// ---------------------------------------------------------------------------

describe('Canvas2DRenderer / putImageData', () => {
  it('putImageData 後に present() が呼ばれる（drawImage が実行される）', () => {
    const { canvas, ctx } = makeCanvas2DWithMockCtx();
    const renderer = new Canvas2DRenderer(canvas);
    ctx.drawImage.mockClear();
    renderer.putImageData(new ImageData(100, 100));
    expect(ctx.drawImage).toHaveBeenCalled();
  });
});
