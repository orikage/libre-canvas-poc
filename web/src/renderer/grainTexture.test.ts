import { describe, it, expect } from 'vitest';
import {
  TEX_SIZE,
  hash2,
  valueNoise,
  pencilGrain,
  charcoalGrain,
  generateGrainData,
  DEFAULT_GRAIN_SCALE,
} from './grainTexture';

// ---------------------------------------------------------------------------
// hash2
// ---------------------------------------------------------------------------
describe('hash2', () => {
  it('戻り値は [0, 1) の範囲に収まる', () => {
    for (const [x, y] of [[0, 0], [1, 0], [255, 255], [511, 511]]) {
      const v = hash2(x, y);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('TEX_SIZE でラップして同じ値を返す（タイル可能性）', () => {
    // hash2(x, y) === hash2(x + TEX_SIZE, y) が成立することでテクスチャが継ぎ目なくタイルできる
    expect(hash2(0, 0)).toBeCloseTo(hash2(TEX_SIZE, 0), 10);
    expect(hash2(0, 0)).toBeCloseTo(hash2(0, TEX_SIZE), 10);
    expect(hash2(3, 7)).toBeCloseTo(hash2(3 + TEX_SIZE, 7), 10);
  });

  it('異なる入力は（ほぼ常に）異なる値を返す', () => {
    const v00 = hash2(0, 0);
    const v10 = hash2(1, 0);
    const v01 = hash2(0, 1);
    expect(v00).not.toBeCloseTo(v10, 5);
    expect(v00).not.toBeCloseTo(v01, 5);
  });
});

// ---------------------------------------------------------------------------
// valueNoise
// ---------------------------------------------------------------------------
describe('valueNoise', () => {
  it('戻り値は [0, 1] の範囲に収まる', () => {
    const samples = [
      [0, 0], [0.5, 0.5], [1.5, 2.3], [8.0, 8.0], [100.7, 200.1],
    ];
    for (const [x, y] of samples) {
      const v = valueNoise(x, y);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('整数格子点での値は hash2 と一致する', () => {
    // valueNoise(ix, iy) では fx=fy=0 なので a = hash2(ix, iy) が返る
    expect(valueNoise(0, 0)).toBeCloseTo(hash2(0, 0), 10);
    expect(valueNoise(3, 7)).toBeCloseTo(hash2(3, 7), 10);
  });

  it('連続性: 近い座標は近い値を返す（大きなジャンプがない）', () => {
    const v1 = valueNoise(2.0, 2.0);
    const v2 = valueNoise(2.001, 2.001);
    expect(Math.abs(v1 - v2)).toBeLessThan(0.01);
  });
});

// ---------------------------------------------------------------------------
// pencilGrain
// ---------------------------------------------------------------------------
describe('pencilGrain', () => {
  it('戻り値は [0, 1] に収まる', () => {
    const samples = [[0, 0], [0.25, 0.75], [0.5, 0.5], [1.0, 1.0]];
    for (const [nx, ny] of samples) {
      const v = pencilGrain(nx, ny);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('平均値が 0.5 を上回る（鉛筆の高被覆率バイアス）', () => {
    // 4×4 グリッドでサンプリングして統計確認
    let sum = 0;
    const N = 16;
    for (let i = 0; i < N; i++) {
      sum += pencilGrain(i / N, i / N);
    }
    expect(sum / N).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// charcoalGrain
// ---------------------------------------------------------------------------
describe('charcoalGrain', () => {
  it('戻り値は [0, 1] に収まる', () => {
    const samples = [[0, 0], [0.3, 0.6], [0.7, 0.2], [1.0, 0.0]];
    for (const [nx, ny] of samples) {
      const v = charcoalGrain(nx, ny);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('鉛筆より低い平均値（より多くの暗部＝コントラスト強め）', () => {
    let sumPencil = 0, sumCharcoal = 0;
    const N = 32;
    for (let i = 0; i < N; i++) {
      const nx = i / N, ny = (N - i) / N;
      sumPencil   += pencilGrain(nx, ny);
      sumCharcoal += charcoalGrain(nx, ny);
    }
    // 鉛筆の方が明るい傾向
    expect(sumPencil / N).toBeGreaterThan(sumCharcoal / N);
  });
});

// ---------------------------------------------------------------------------
// generateGrainData
// ---------------------------------------------------------------------------
describe('generateGrainData', () => {
  it('戻り値のバイト長が TEX_SIZE × TEX_SIZE × 4 と一致する', () => {
    for (const type of ['round', 'pencil', 'charcoal'] as const) {
      const data = generateGrainData(type);
      expect(data.byteLength).toBe(TEX_SIZE * TEX_SIZE * 4);
    }
  });

  it('round テクスチャは全ピクセルが 255（完全白）', () => {
    const data = generateGrainData('round');
    let found = false;
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== 255) { found = true; break; }
    }
    expect(found).toBe(false);
  });

  it('pencil テクスチャの全ピクセルが [0, 255] の範囲', () => {
    const data = generateGrainData('pencil');
    // expect() を 100 万回呼ぶと遅いので手動ループで検証
    let outOfRange = false;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < 0 || data[i] > 255) { outOfRange = true; break; }
    }
    expect(outOfRange).toBe(false);
  });

  it('charcoal テクスチャの全ピクセルが [0, 255] の範囲', () => {
    const data = generateGrainData('charcoal');
    let outOfRange = false;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < 0 || data[i] > 255) { outOfRange = true; break; }
    }
    expect(outOfRange).toBe(false);
  });

  it('Alpha チャンネルは全テクスチャで常に 255', () => {
    for (const type of ['round', 'pencil', 'charcoal'] as const) {
      const data = generateGrainData(type);
      let found = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 255) { found = true; break; }
      }
      expect(found).toBe(false);
    }
  });

  it('RGB チャンネルが等しい（グレースケール）', () => {
    for (const type of ['pencil', 'charcoal'] as const) {
      const data = generateGrainData(type);
      // 先頭 100 ピクセルのみ確認（全走査はコストが高いため）
      for (let i = 0; i < 400; i += 4) {
        expect(data[i]).toBe(data[i + 1]); // R === G
        expect(data[i]).toBe(data[i + 2]); // R === B
      }
    }
  });

  it('pencil と charcoal は異なるテクスチャを生成する', () => {
    const pencil   = generateGrainData('pencil');
    const charcoal = generateGrainData('charcoal');
    let diff = 0;
    for (let i = 0; i < pencil.length; i += 4) {
      diff += Math.abs(pencil[i] - charcoal[i]);
    }
    expect(diff).toBeGreaterThan(0);
  });

  it('生成結果は冪等（同じ型に対して同じデータを返す）', { timeout: 30000 }, () => {
    const a = generateGrainData('pencil');
    const b = generateGrainData('pencil');
    // Uint8Array の要素を逐次比較（toEqual は大きな型付き配列で遅いためループで検証）
    expect(a.length).toBe(b.length);
    let diff = false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { diff = true; break; }
    }
    expect(diff).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_GRAIN_SCALE
// ---------------------------------------------------------------------------
describe('DEFAULT_GRAIN_SCALE', () => {
  it('round の grain_scale は 1（ソリッドテクスチャに影響なし）', () => {
    expect(DEFAULT_GRAIN_SCALE.round).toBe(1);
  });

  it('pencil の grain_scale は charcoal より小さい（より細かいグレイン）', () => {
    expect(DEFAULT_GRAIN_SCALE.pencil).toBeLessThan(DEFAULT_GRAIN_SCALE.charcoal);
  });

  it('全テクスチャ型の grain_scale が正の値', () => {
    for (const scale of Object.values(DEFAULT_GRAIN_SCALE)) {
      expect(scale).toBeGreaterThan(0);
    }
  });
});
