/**
 * FileManager のテスト。
 *
 * parseFile / createSaveData は protected なので、
 * テスト用サブクラス (TestableFileManager) でメソッドを公開してテストする。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileManager } from './FileManager';
import { LayerManager } from '../layer/LayerManager';

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

// btoa / atob スタブ（Node.js 環境用）
if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (s: string) => Buffer.from(s, 'binary').toString('base64');
  globalThis.atob = (s: string) => Buffer.from(s, 'base64').toString('binary');
}

// ---------------------------------------------------------------------------
// テスト用サブクラス（protected メソッドを公開）
// ---------------------------------------------------------------------------

class TestableFileManager extends FileManager {
  public parseFilePublic(text: string): LayerManager | null {
    return this.parseFile(text);
  }

  public createSaveDataPublic(renderer: any, layerManager: LayerManager) {
    return this.createSaveData(renderer, layerManager);
  }
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeLayerManager(w = 4, h = 4): LayerManager {
  return new LayerManager(w, h);
}

/** ImageData を Base64 エンコードした文字列を生成する（テストデータ用）*/
function imageDataToBase64(data: ImageData): string {
  const bytes = Array.from(data.data);
  const binary = bytes.map((b) => String.fromCharCode(b)).join('');
  return btoa(binary);
}

/** 最小構成の LCV JSON 文字列を生成する */
function makeLcvJson(options: {
  width?: number;
  height?: number;
  activeLayerIndex?: number;
  layerCount?: number;
} = {}): string {
  const { width = 4, height = 4, activeLayerIndex = 0, layerCount = 2 } = options;
  const pixelCount = width * height * 4;
  const emptyData = btoa(new Array(pixelCount).fill('\x00').join(''));

  const layers = Array.from({ length: layerCount }, (_, i) => ({
    id: i + 1,
    name: i === 0 ? 'Background' : `Layer ${i + 1}`,
    visible: true,
    opacity: 1.0,
    blendMode: 'normal',
    data: emptyData,
  }));

  return JSON.stringify({
    version: '0.1.0',
    width,
    height,
    activeLayerIndex,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    layers,
  });
}

// ---------------------------------------------------------------------------
// parseFile
// ---------------------------------------------------------------------------

describe('FileManager / parseFile', () => {
  it('2 レイヤーの lcv データから LayerManager が構築される', () => {
    const fm = new TestableFileManager();
    const json = makeLcvJson({ layerCount: 2 });
    const result = fm.parseFilePublic(json);
    expect(result).not.toBeNull();
    expect(result?.getLayerCount()).toBe(2);
  });

  it('復元された LayerManager の getLayerCount() が layers 配列の長さと一致する', () => {
    const fm = new TestableFileManager();
    const json = makeLcvJson({ layerCount: 3 });
    const result = fm.parseFilePublic(json);
    expect(result?.getLayerCount()).toBe(3);
  });

  it('各レイヤーの name が保持される', () => {
    const fm = new TestableFileManager();
    const json = makeLcvJson({ layerCount: 2 });
    const result = fm.parseFilePublic(json)!;
    expect(result.getLayerInfo(0)?.name).toBe('Background');
    expect(result.getLayerInfo(1)?.name).toBe('Layer 2');
  });

  it('各レイヤーの opacity が保持される', () => {
    const fm = new TestableFileManager();
    // opacity=0.5 のレイヤーを持つ JSON
    const data = JSON.parse(makeLcvJson({ layerCount: 1 }));
    data.layers[0].opacity = 0.5;
    const result = fm.parseFilePublic(JSON.stringify(data))!;
    expect(result.getLayerInfo(0)?.opacity).toBeCloseTo(0.5);
  });

  it('各レイヤーの blendMode が保持される', () => {
    const fm = new TestableFileManager();
    const data = JSON.parse(makeLcvJson({ layerCount: 1 }));
    data.layers[0].blendMode = 'multiply';
    const result = fm.parseFilePublic(JSON.stringify(data))!;
    expect(result.getLayerInfo(0)?.blendMode).toBe('multiply');
  });

  it('各レイヤーの visible が保持される', () => {
    const fm = new TestableFileManager();
    const data = JSON.parse(makeLcvJson({ layerCount: 1 }));
    data.layers[0].visible = false;
    const result = fm.parseFilePublic(JSON.stringify(data))!;
    expect(result.getLayerInfo(0)?.visible).toBe(false);
  });

  it('activeLayerIndex が保持される', () => {
    const fm = new TestableFileManager();
    const json = makeLcvJson({ layerCount: 3, activeLayerIndex: 2 });
    const result = fm.parseFilePublic(json)!;
    expect(result.getActiveLayerIndex()).toBe(2);
  });

  it('activeLayerIndex が省略された場合は 0 になる', () => {
    const fm = new TestableFileManager();
    const data = JSON.parse(makeLcvJson({ layerCount: 2 }));
    delete data.activeLayerIndex;
    const result = fm.parseFilePublic(JSON.stringify(data))!;
    expect(result.getActiveLayerIndex()).toBe(0);
  });

  it('不正な JSON は null を返す', () => {
    const fm = new TestableFileManager();
    const result = fm.parseFilePublic('NOT_JSON');
    expect(result).toBeNull();
  });

  it('復元された LayerManager の width / height が一致する', () => {
    const fm = new TestableFileManager();
    const json = makeLcvJson({ width: 8, height: 6 });
    const result = fm.parseFilePublic(json)!;
    expect(result.getWidth()).toBe(8);
    expect(result.getHeight()).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// createSaveData
// ---------------------------------------------------------------------------

describe('FileManager / createSaveData', () => {
  // Renderer モック（width/height だけ必要）
  function makeRenderer(w = 4, h = 4) {
    return {
      getType: vi.fn().mockReturnValue('canvas2d'),
      getImageData: vi.fn().mockReturnValue(new ImageData(w, h)),
    };
  }

  it('出力に activeLayerIndex が含まれる', () => {
    const fm = new TestableFileManager();
    const lm = makeLayerManager();
    lm.addLayer('Ink');
    lm.setActiveLayer(1);
    const data = fm.createSaveDataPublic(makeRenderer(), lm) as any;
    expect(data.activeLayerIndex).toBe(1);
  });

  it('layers の各要素に data フィールド（Base64 文字列）が含まれる', () => {
    const fm = new TestableFileManager();
    const lm = makeLayerManager();
    const data = fm.createSaveDataPublic(makeRenderer(), lm) as any;
    for (const layer of data.layers) {
      expect(typeof layer.data).toBe('string');
      expect(layer.data.length).toBeGreaterThan(0);
    }
  });

  it('width と height が LayerManager の値と一致する', () => {
    const fm = new TestableFileManager();
    const lm = new LayerManager(8, 6);
    const data = fm.createSaveDataPublic(makeRenderer(8, 6), lm) as any;
    expect(data.width).toBe(8);
    expect(data.height).toBe(6);
  });

  it('レイヤー数が LayerManager のカウントと一致する', () => {
    const fm = new TestableFileManager();
    const lm = makeLayerManager();
    lm.addLayer('Extra');
    const data = fm.createSaveDataPublic(makeRenderer(), lm) as any;
    expect(data.layers.length).toBe(2);
  });

  it('シリアライズしてデシリアライズするとレイヤー内容が往復する', () => {
    const fm = new TestableFileManager();
    const lm = makeLayerManager();
    lm.addLayer('Sketch');
    lm.setActiveLayer(1);
    const saved = fm.createSaveDataPublic(makeRenderer(), lm) as any;
    const restored = fm.parseFilePublic(JSON.stringify(saved))!;
    expect(restored.getLayerCount()).toBe(2);
    expect(restored.getLayerInfo(1)?.name).toBe('Sketch');
    expect(restored.getActiveLayerIndex()).toBe(1);
  });
});
