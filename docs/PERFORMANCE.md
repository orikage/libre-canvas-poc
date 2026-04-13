# パフォーマンス現状

> 最終更新: 2026-04-13 02:03 UTC / コミット: `febb706a`

ストローク描画パイプラインのベンチマーク結果（`cargo bench` 実行値、release ビルド）。レイヤー合成は対象外。

## StrokeSmoother（EMAスムージング）

| ベンチマーク | 実行時間 | 標準偏差 |
|------------|---------|--------|
| `smoother max 20 stages` | 46.28 ns | ±0.61 ns |
| `smoother sai 3 stages` | 10.14 ns | ±0.07 ns |
| `smoother single stage 1` | 9.49 ns | ±0.05 ns |
| `smoother stroke 100pts sai` | 1.00 µs | ±6.74 ns |

## DabGenerator（ダブ生成）

| ベンチマーク | 実行時間 | 標準偏差 |
|------------|---------|--------|
| `dab first point` | 28.02 ns | ±0.63 ns |
| `dab long stroke dense 100pts` | 13.70 µs | ±1.07 µs |
| `dab long stroke sparse 100pts` | 4.23 µs | ±79.15 ns |
| `dab short stroke dense` | 597.18 ns | ±9.40 ns |

## SparseCanvas（スパースキャンバス）

| ベンチマーク | 実行時間 | 標準偏差 |
|------------|---------|--------|
| `draw point large radius` | 249.44 µs | ±1.78 µs |
| `draw point small radius` | 2.32 µs | ±42.27 ns |
| `full stroke 100 dabs` | 1.20 ms | ±41.36 µs |

## Tile（タイルピクセル操作）

| ベンチマーク | 実行時間 | 標準偏差 |
|------------|---------|--------|
| `tile blend all pixels` | 377.00 µs | ±6.40 µs |
| `tile blend pixel single` | 22.87 ns | ±0.12 ns |
| `tile set pixel all` | 69.07 µs | ±630.29 ns |

