# パフォーマンス現状

> 最終更新: 2026-04-13 11:30 UTC / コミット: `3262c2bf`

ストローク描画パイプラインのベンチマーク結果（`cargo bench` 実行値、release ビルド）。レイヤー合成は対象外。

## StrokeSmoother（EMAスムージング）

| ベンチマーク | 実行時間 | 標準偏差 |
|------------|---------|--------|
| `smoother max 20 stages` | 41.51 ns | ±0.30 ns |
| `smoother sai 3 stages` | 8.81 ns | ±0.06 ns |
| `smoother single stage 1` | 8.40 ns | ±0.05 ns |
| `smoother stroke 100pts sai` | 908.46 ns | ±5.62 ns |

## DabGenerator（ダブ生成）

| ベンチマーク | 実行時間 | 標準偏差 |
|------------|---------|--------|
| `dab first point` | 23.59 ns | ±7.50 ns |
| `dab long stroke dense 100pts` | 13.16 µs | ±3.38 µs |
| `dab long stroke sparse 100pts` | 3.09 µs | ±29.71 ns |
| `dab short stroke dense` | 551.45 ns | ±7.59 ns |

## SparseCanvas（スパースキャンバス）

| ベンチマーク | 実行時間 | 標準偏差 |
|------------|---------|--------|
| `draw point large radius` | 254.16 µs | ±3.39 µs |
| `draw point small radius` | 2.29 µs | ±106.01 ns |
| `full stroke 100 dabs` | 1.15 ms | ±58.51 µs |

## Tile（タイルピクセル操作）

| ベンチマーク | 実行時間 | 標準偏差 |
|------------|---------|--------|
| `tile blend all pixels` | 338.49 µs | ±205.82 µs |
| `tile blend pixel single` | 19.79 ns | ±0.10 ns |
| `tile set pixel all` | 61.30 µs | ±2.67 µs |

