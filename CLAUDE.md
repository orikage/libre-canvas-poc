# LibreCanvas PoC — Claude向け開発ガイド

## プロジェクト概要

軽量・完全無料のオープンソース・ペイントツールのPoC。
- **コア**: Rust + WebAssembly（ストロークスムージング・レイヤー合成）
- **フロントエンド**: TypeScript + Vite
- **レンダリング**: WebGPU（フォールバック: Canvas2D）
- **データ同期**: BYOS（Bring Your Own Storage）—中央サーバーなし

---

## 開発サーバー起動

```bash
# ローカル（Rust + Node.js が必要）
make dev          # wasm-packビルド → Vite devサーバー起動 (localhost:5173)

# Docker（環境構築不要）
make docker-dev   # Docker Compose でそのまま起動
```

---

## よく使うコマンド

| コマンド | 内容 |
|---------|------|
| `make dev` | WASMビルド + devサーバー起動 |
| `make build-wasm` | Rustコアのみ再ビルド（`web/src/wasm/pkg/` に出力） |
| `make test` | Rustユニットテスト実行 |
| `make build` | 本番ビルド（`web/dist/`） |
| `make clean` | ビルド成果物を全削除 |

---

## ディレクトリ構成と各ファイルの役割

```
libre-canvas-poc/
├── core/src/              # Rust/WASM コア
│   ├── lib.rs             # wasm-bindgen エントリ（#[wasm_bindgen(start)] で自動init）
│   ├── input.rs           # RawPoint / SmoothPoint 構造体
│   ├── brush/blend.rs     # 乗算・スクリーン・オーバーレイ（プリマルチアルファ）
│   ├── stroke/smoothing.rs# StrokeSmoother: 多段EMAアルゴリズム（SAI互換）
│   ├── stroke/dab.rs      # DabGenerator: 筆圧対応ダブ配置
│   ├── layer/mod.rs       # Layer + LayerStack 構造体
│   └── canvas/sparse.rs   # タイルベースキャンバス（256×256タイル）
│
└── web/src/               # TypeScript フロントエンド
    ├── main.ts            # エントリーポイント（初期化順序に注意）
    ├── wasm/
    │   ├── wasmLoader.ts  # WASMローダー（★ module.default()の呼び出しが必須）
    │   └── pkg/           # wasm-pack生成ファイル（コミット済み）
    ├── renderer/
    │   ├── Renderer.ts    # インターフェース + createRenderer()ファクトリ
    │   ├── WebGPURenderer.ts  # WebGPUバックエンド（WGSLシェーダー内蔵）
    │   └── Canvas2DRenderer.ts # Canvas2Dフォールバック
    ├── canvas/
    │   ├── CanvasManager.ts   # ストローク管理（static create()で非同期初期化）
    │   └── InputHandler.ts    # Pointer Events（マウス・ペン・タッチ統合）
    ├── layer/LayerManager.ts  # レイヤー管理（TypeScript実装）
    ├── file/FileManager.ts    # .lcvファイル保存/読込・PNG書き出し
    ├── ui/
    │   ├── Toolbar.ts         # ツールバー（#toolbar-containerに挿入）
    │   └── LayerPanel.ts      # レイヤーパネルUI
    └── styles/main.css        # ダークテーマCSS
```

---

## 重要な実装上の注意点

### 1. WASM初期化は必ず `module.default()` を呼ぶ

```typescript
// wasmLoader.ts
const module = await import('./pkg/libre_canvas_core');
await module.default(); // ← これがないとWASMバイナリが初期化されず全機能が壊れる
```

`#[wasm_bindgen(start)]` があっても `module.default()` を明示的に呼ぶまでwasm-bindgenは初期化されない。

### 2. CanvasManagerはasyncファクトリで生成する

```typescript
// ✅ 正しい
const canvasManager = await CanvasManager.create(canvas);

// ❌ NG（コンストラクタはprivate）
const canvasManager = new CanvasManager(canvas);
```

内部で `createRenderer()` を呼び、WebGPU優先でCanvas2Dにフォールバックする。

### 3. ツールバーは `#toolbar-container` に挿入する

```typescript
// Toolbar.ts — bodyに直接insertBeforeしてはいけない（レイアウト崩壊）
const toolbarContainer = document.getElementById('toolbar-container');
toolbarContainer.appendChild(this.container);
```

HTMLの `#app > #toolbar-container > #main-area` の構造を維持すること。

### 4. `window.toolbar` は予約済みプロパティ

`window.toolbar` はブラウザ組み込みの `BarProp` オブジェクト（読み取り専用）。
グローバルデバッグ用途では `window.appToolbar` を使う。

### 5. WebGPUレンダラーの構造

```
drawLine/drawCircle
  └→ CPU側でdab配列生成（spacing = size * 0.25）
  └→ writeBuffer（dabBuffer）
  └→ RenderPass → drawingTexture（rgba8unorm, 永続）
      ブレンド: one / one-minus-src-alpha（プリマルチアルファ）

present()
  └→ RenderPass → canvasスワップチェーン
      blitシェーダーでdrawingTextureをフルスクリーン転送

getImageData() / putImageData()
  └→ shadowCanvas（Canvas2D）で管理（同期APIのため）
```

---

## アーキテクチャ上の制約（PoCフェーズ）

| 項目 | 現状 | 将来 |
|------|------|------|
| レイヤー合成 | TypeScript（CPU） | Rust/Wasm または WebGPU compute |
| アンドゥ/リドゥ | **未実装** | コマンドパターンで実装予定 |
| 色の混色 | アルファブレンドのみ | Kubelka-Munk簡易版 |
| ブラシテクスチャ | 円形のみ | `.lcb`形式で外部定義 |
| ファイル形式 | `.lcv`（JSON+Base64） | バイナリ最適化を検討 |

---

## ファイル形式

### `.lcv` (LibreCanvas Vector)

```json
{
  "version": "0.1.0",
  "width": 1920,
  "height": 1080,
  "createdAt": "2026-04-11T...",
  "layers": [
    {
      "id": 1,
      "name": "Background",
      "visible": true,
      "opacity": 1.0,
      "blendMode": "normal",
      "data": "<base64 encoded ImageData>"
    }
  ]
}
```

---

## Rustテスト

```bash
make test
# または
cd core && cargo test
```

テストカバレッジ: `smoothing.rs`（3件）、`blend.rs`（7件）、`dab.rs`（3件）、`sparse.rs`（5件）

---

## よくあるトラブル

| 症状 | 原因 | 対処 |
|------|------|------|
| 画面が真っ白 | WASM初期化前にJS処理が失敗 | `wasmLoader.ts`で`module.default()`を確認 |
| ツールバーが見えない | `#toolbar-container`が存在しない | `index.html`を確認 |
| WebGPU: OFF | ブラウザ非対応またはセキュアコンテキスト外 | Chrome 113+、HTTPSまたはlocalhost |
| wasm-packエラー | Rustバージョン不一致 | `rust-toolchain.toml`確認 |
| PKGが古い | Rustコード変更後にpkgが未再生成 | `make build-wasm` |
