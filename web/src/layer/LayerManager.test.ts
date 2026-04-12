import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LayerManager } from './LayerManager';

// ---------------------------------------------------------------------------
// Node 環境で未定義な ブラウザ API のスタブ
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
// ヘルパー
// ---------------------------------------------------------------------------
function makeManager(w = 100, h = 100) {
  return new LayerManager(w, h);
}

// ---------------------------------------------------------------------------
// 初期状態
// ---------------------------------------------------------------------------
describe('LayerManager / 初期状態', () => {
  it('インスタンス生成直後にレイヤーが1枚だけ存在する', () => {
    const lm = makeManager();
    expect(lm.getLayerCount()).toBe(1);
  });

  it('初期レイヤーの名前は "Background"', () => {
    const lm = makeManager();
    expect(lm.getLayerInfo(0)?.name).toBe('Background');
  });

  it('初期のアクティブレイヤーはインデックス 0', () => {
    const lm = makeManager();
    expect(lm.getActiveLayerIndex()).toBe(0);
  });

  it('初期レイヤーは可視で不透明度 1.0、ブレンドモード normal', () => {
    const lm = makeManager();
    const info = lm.getLayerInfo(0)!;
    expect(info.visible).toBe(true);
    expect(info.opacity).toBe(1.0);
    expect(info.blendMode).toBe('normal');
  });

  it('指定したサイズの ImageData を持つ', () => {
    const lm = new LayerManager(320, 240);
    const data = lm.getActiveLayerImageData();
    expect(data?.width).toBe(320);
    expect(data?.height).toBe(240);
  });
});

// ---------------------------------------------------------------------------
// addLayer
// ---------------------------------------------------------------------------
describe('LayerManager / addLayer', () => {
  it('レイヤーを追加するとカウントが増える', () => {
    const lm = makeManager();
    lm.addLayer('Layer 2');
    expect(lm.getLayerCount()).toBe(2);
  });

  it('追加したレイヤーが指定した名前を持つ', () => {
    const lm = makeManager();
    lm.addLayer('Sketch');
    expect(lm.getLayerInfo(1)?.name).toBe('Sketch');
  });

  it('追加後のアクティブレイヤーは新しいレイヤー', () => {
    const lm = makeManager();
    lm.addLayer('Layer 2');
    expect(lm.getActiveLayerIndex()).toBe(1);
  });

  it('追加されたレイヤーはデフォルトで可視・不透明度 1.0', () => {
    const lm = makeManager();
    lm.addLayer('Layer 2');
    const info = lm.getLayerInfo(1)!;
    expect(info.visible).toBe(true);
    expect(info.opacity).toBe(1.0);
  });

  it('onChange コールバックが呼ばれる', () => {
    const onChange = vi.fn();
    const lm = new LayerManager(100, 100, onChange);
    onChange.mockClear(); // constructor 内の addLayer 呼び出しをリセット
    lm.addLayer('New');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// removeLayer
// ---------------------------------------------------------------------------
describe('LayerManager / removeLayer', () => {
  it('レイヤーを削除するとカウントが減る', () => {
    const lm = makeManager();
    lm.addLayer('Layer 2');
    lm.removeLayer(1);
    expect(lm.getLayerCount()).toBe(1);
  });

  it('最後の1枚は削除できない（false を返す）', () => {
    const lm = makeManager();
    const result = lm.removeLayer(0);
    expect(result).toBe(false);
    expect(lm.getLayerCount()).toBe(1);
  });

  it('範囲外インデックスの削除は false を返す', () => {
    const lm = makeManager();
    expect(lm.removeLayer(-1)).toBe(false);
    expect(lm.removeLayer(99)).toBe(false);
  });

  it('アクティブレイヤーが末尾にある状態で削除すると activeIndex が補正される', () => {
    const lm = makeManager();
    lm.addLayer('Layer 2');
    // activeIndex = 1
    lm.removeLayer(1);
    expect(lm.getActiveLayerIndex()).toBe(0);
  });

  it('削除成功時に onChange が呼ばれる', () => {
    const onChange = vi.fn();
    const lm = new LayerManager(100, 100, onChange);
    lm.addLayer('Layer 2');
    onChange.mockClear();
    lm.removeLayer(0);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// setActiveLayer
// ---------------------------------------------------------------------------
describe('LayerManager / setActiveLayer', () => {
  it('有効なインデックスを指定するとアクティブが変わる', () => {
    const lm = makeManager();
    lm.addLayer('Layer 2');
    lm.setActiveLayer(0);
    expect(lm.getActiveLayerIndex()).toBe(0);
  });

  it('範囲外インデックスは無視される', () => {
    const lm = makeManager();
    lm.setActiveLayer(99);
    expect(lm.getActiveLayerIndex()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// moveLayer
// ---------------------------------------------------------------------------
describe('LayerManager / moveLayer', () => {
  it('from と to を入れ替えるとレイヤー順が変わる', () => {
    const lm = makeManager();
    lm.addLayer('A');
    lm.addLayer('B');
    // 順: [Background, A, B]
    lm.moveLayer(0, 2);
    // 順: [A, B, Background]
    expect(lm.getLayerInfo(2)?.name).toBe('Background');
    expect(lm.getLayerInfo(0)?.name).toBe('A');
  });

  it('移動したアクティブレイヤーの activeIndex が追従する', () => {
    const lm = makeManager();
    lm.addLayer('A');
    // activeIndex = 1 (A)
    lm.moveLayer(1, 0);
    // A が 0 に移動したので activeIndex = 0
    expect(lm.getActiveLayerIndex()).toBe(0);
    expect(lm.getLayerInfo(0)?.name).toBe('A');
  });

  it('範囲外インデックスは false を返す', () => {
    const lm = makeManager();
    expect(lm.moveLayer(-1, 0)).toBe(false);
    expect(lm.moveLayer(0, 99)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// プロパティ更新
// ---------------------------------------------------------------------------
describe('LayerManager / プロパティ更新', () => {
  it('setLayerVisible で可視状態が変わる', () => {
    const lm = makeManager();
    lm.setLayerVisible(0, false);
    expect(lm.getLayerInfo(0)?.visible).toBe(false);
  });

  it('setLayerOpacity で不透明度が変わる', () => {
    const lm = makeManager();
    lm.setLayerOpacity(0, 0.5);
    expect(lm.getLayerInfo(0)?.opacity).toBe(0.5);
  });

  it('setLayerOpacity は 0 未満を 0 にクランプする', () => {
    const lm = makeManager();
    lm.setLayerOpacity(0, -0.1);
    expect(lm.getLayerInfo(0)?.opacity).toBe(0);
  });

  it('setLayerOpacity は 1 超を 1 にクランプする', () => {
    const lm = makeManager();
    lm.setLayerOpacity(0, 1.5);
    expect(lm.getLayerInfo(0)?.opacity).toBe(1);
  });

  it('setLayerBlendMode でブレンドモードが変わる', () => {
    const lm = makeManager();
    lm.setLayerBlendMode(0, 'multiply');
    expect(lm.getLayerInfo(0)?.blendMode).toBe('multiply');
  });

  it('setLayerName で名前が変わる', () => {
    const lm = makeManager();
    lm.setLayerName(0, 'Renamed');
    expect(lm.getLayerInfo(0)?.name).toBe('Renamed');
  });
});

// ---------------------------------------------------------------------------
// composite
// ---------------------------------------------------------------------------
describe('LayerManager / composite', () => {
  it('合成結果は指定サイズの ImageData を返す', () => {
    const lm = new LayerManager(4, 4);
    const out = lm.composite();
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);
  });

  it('透明なレイヤーのみの場合、白背景が返る', () => {
    const lm = new LayerManager(1, 1);
    // Background の imageData は透明（デフォルト）
    const out = lm.composite();
    // 白初期化されるため R=255,G=255,B=255,A=255
    expect(out.data[0]).toBe(255); // R
    expect(out.data[3]).toBe(255); // A
  });

  it('不透明な赤ピクセルが合成結果に反映される', () => {
    const lm = new LayerManager(1, 1);
    // アクティブレイヤーの imageData に赤を書き込む
    const imgData = lm.getActiveLayerImageData()!;
    imgData.data[0] = 255; // R
    imgData.data[1] = 0;   // G
    imgData.data[2] = 0;   // B
    imgData.data[3] = 255; // A (fully opaque)
    lm.setActiveLayerImageData(imgData);

    const out = lm.composite();
    expect(out.data[0]).toBe(255); // R
    expect(out.data[1]).toBe(0);   // G
    expect(out.data[2]).toBe(0);   // B
  });

  it('非表示レイヤーは合成に含まれない', () => {
    const lm = new LayerManager(1, 1);
    // 赤で描画して非表示にする
    const imgData = lm.getActiveLayerImageData()!;
    imgData.data[0] = 255; imgData.data[3] = 255;
    lm.setActiveLayerImageData(imgData);
    lm.setLayerVisible(0, false);

    const out = lm.composite();
    // 非表示なので白背景のまま
    expect(out.data[0]).toBe(255); // 白の R
    expect(out.data[1]).toBe(255); // 白の G
  });

  it('opacity 0 のレイヤーは合成に影響しない', () => {
    const lm = new LayerManager(1, 1);
    const imgData = lm.getActiveLayerImageData()!;
    imgData.data[0] = 0; imgData.data[3] = 255;
    lm.setActiveLayerImageData(imgData);
    lm.setLayerOpacity(0, 0);

    const out = lm.composite();
    expect(out.data[0]).toBe(255); // 白背景のまま
  });
});

// ---------------------------------------------------------------------------
// resetToSize
// ---------------------------------------------------------------------------
describe('LayerManager / resetToSize', () => {
  it('リセット後は Background 1 枚の状態に戻る', () => {
    const lm = makeManager();
    lm.addLayer('Extra');
    lm.resetToSize(200, 150);
    expect(lm.getLayerCount()).toBe(1);
    expect(lm.getLayerInfo(0)?.name).toBe('Background');
  });

  it('新しいサイズで ImageData が再生成される', () => {
    const lm = makeManager(100, 100);
    lm.resetToSize(200, 150);
    const data = lm.getActiveLayerImageData();
    expect(data?.width).toBe(200);
    expect(data?.height).toBe(150);
  });

  it('getWidth / getHeight が新サイズを返す', () => {
    const lm = makeManager();
    lm.resetToSize(1920, 1080);
    expect(lm.getWidth()).toBe(1920);
    expect(lm.getHeight()).toBe(1080);
  });
});

// ---------------------------------------------------------------------------
// serialize / deserialize
// ---------------------------------------------------------------------------
describe('LayerManager / serialize・deserialize', () => {
  it('シリアライズ → デシリアライズでレイヤー数が一致する', () => {
    const lm = makeManager();
    lm.addLayer('Ink');
    const json = lm.serialize() as any;
    const restored = LayerManager.deserialize(json);
    expect(restored.getLayerCount()).toBe(2);
  });

  it('デシリアライズ後にレイヤー名が保持されている', () => {
    const lm = makeManager();
    lm.addLayer('Sketch');
    const json = lm.serialize() as any;
    const restored = LayerManager.deserialize(json);
    expect(restored.getLayerInfo(1)?.name).toBe('Sketch');
  });

  it('デシリアライズ後に activeLayerIndex が保持される', () => {
    const lm = makeManager();
    lm.addLayer('A');
    lm.setActiveLayer(0);
    const json = lm.serialize() as any;
    const restored = LayerManager.deserialize(json);
    expect(restored.getActiveLayerIndex()).toBe(0);
  });

  it('デシリアライズ後に width / height が一致する', () => {
    const lm = new LayerManager(800, 600);
    const json = lm.serialize() as any;
    const restored = LayerManager.deserialize(json);
    expect(restored.getWidth()).toBe(800);
    expect(restored.getHeight()).toBe(600);
  });
});

// ---------------------------------------------------------------------------
// getAllLayerInfo
// ---------------------------------------------------------------------------
describe('LayerManager / getAllLayerInfo', () => {
  it('返り値はコピーであり、元のデータを変更しない', () => {
    const lm = makeManager();
    const infos = lm.getAllLayerInfo();
    infos[0].name = 'Tampered';
    expect(lm.getLayerInfo(0)?.name).toBe('Background');
  });
});

// ---------------------------------------------------------------------------
// replaceWith
// ---------------------------------------------------------------------------
describe('LayerManager / replaceWith', () => {
  it('置換後のレイヤー数が新インスタンスと一致する', () => {
    const lm = makeManager();
    const other = makeManager();
    other.addLayer('Layer 2');
    other.addLayer('Layer 3');
    lm.replaceWith(other);
    expect(lm.getLayerCount()).toBe(3);
  });

  it('置換後の width が新インスタンスと一致する', () => {
    const lm = makeManager(100, 100);
    const other = new LayerManager(320, 240);
    lm.replaceWith(other);
    expect(lm.getWidth()).toBe(320);
    expect(lm.getHeight()).toBe(240);
  });

  it('置換後の activeLayerIndex が新インスタンスと一致する', () => {
    const lm = makeManager();
    const other = makeManager();
    other.addLayer('A');
    other.addLayer('B');
    other.setActiveLayer(1);
    lm.replaceWith(other);
    expect(lm.getActiveLayerIndex()).toBe(1);
  });

  it('置換後に新インスタンスのレイヤー名が参照できる', () => {
    const lm = makeManager();
    const other = makeManager();
    other.addLayer('Ink');
    lm.replaceWith(other);
    expect(lm.getLayerInfo(1)?.name).toBe('Ink');
  });

  it('replaceWith で onChange が 1 回呼ばれる', () => {
    const onChange = vi.fn();
    const lm = new LayerManager(100, 100, onChange);
    onChange.mockClear();
    const other = makeManager();
    lm.replaceWith(other);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('置換後も元の onChange コールバックが保持される（新インスタンスのものに上書きされない）', () => {
    const onChange = vi.fn();
    const lm = new LayerManager(100, 100, onChange);
    onChange.mockClear();
    // other は別のコールバックを持つ（constructor 内の addLayer で1回呼ばれる）
    const otherOnChange = vi.fn();
    const other = new LayerManager(100, 100, otherOnChange);
    otherOnChange.mockClear(); // constructor 内の addLayer 呼び出しをリセット
    lm.replaceWith(other);
    // replaceWith の onChange 発火後、さらにレイヤー操作して元の onChange が呼ばれることを確認
    onChange.mockClear();
    lm.addLayer('Test');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(otherOnChange).not.toHaveBeenCalled();
  });
});
