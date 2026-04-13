# パフォーマンス現状

> 最終更新: 2026-04-13 (ローカル初回計測) / コミット: `b5fa3ee`

ストローク描画パイプラインのベンチマーク結果（`cargo bench` 実行値、release ビルド）。レイヤー合成は対象外。

## StrokeSmoother（EMAスムージング）

| ベンチマーク | 実行時間 | 標準偏差 |
|------------|---------|--------|
| `smoother max 20 stages` | 33.31 ns | ±3.16 ns |
| `smoother sai 3 stages` | 6.52 ns | ±1.33 ns |
| `smoother single stage 1` | 6.27 ns | ±0.49 ns |
| `smoother stroke 100pts sai` | 641.41 ns | ±128.83 ns |

## DabGenerator（ダブ生成）

| ベンチマーク | 実行時間 | 標準偏差 |
|------------|---------|--------|
| `dab first point` | 20.71 ns | ±1.23 ns |
| `dab long stroke dense 100pts` | 9.18 µs | ±191.49 ns |
| `dab long stroke sparse 100pts` | 2.28 µs | ±432.24 ns |
| `dab short stroke dense` | 394.16 ns | ±104.20 ns |

## SparseCanvas（スパースキャンバス）

| ベンチマーク | 実行時間 | 標準偏差 |
|------------|---------|--------|
| `draw point large radius` | 223.23 µs | ±20.86 µs |
| `draw point small radius` | 2.05 µs | ±48.55 ns |
| `full stroke 100 dabs` | 1.81 ms | ±229.19 µs |

## Tile（タイルピクセル操作）

| ベンチマーク | 実行時間 | 標準偏差 |
|------------|---------|--------|
| `tile blend all pixels` | 415.96 µs | ±43.01 µs |
| `tile blend pixel single` | 21.84 ns | ±0.48 ns |
| `tile set pixel all` | 44.17 µs | ±7.06 µs |

