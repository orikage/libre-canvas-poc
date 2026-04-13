import { initWasm } from './wasm/wasmLoader';
import { CanvasManager } from './canvas/CanvasManager';
import { Toolbar } from './ui/Toolbar';
import { LayerPanel } from './ui/LayerPanel';
import { LayerManager } from './layer/LayerManager';
import { UndoManager } from './history/UndoManager';

// Global references for debugging
declare global {
  interface Window {
    canvasManager: CanvasManager;
    appToolbar: Toolbar;
    layerManager: LayerManager;
    layerPanel: LayerPanel;
  }
}

async function main() {
  console.log('LibreCanvas starting...');

  // Initialize WebAssembly module
  const wasm = await initWasm();
  if (wasm) {
    console.log(`LibreCanvas Core v${wasm.version()} loaded`);
    console.log(`Wasm test: 2 + 3 = ${wasm.add(2, 3)}`);
  }

  // Get canvas element
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas element not found');
    return;
  }

  // Initialize canvas manager (async: tries WebGPU first, falls back to Canvas2D)
  const canvasManager = await CanvasManager.create(canvas);
  window.canvasManager = canvasManager;
  console.log(`Renderer: ${canvasManager.getRendererType()}`);

  // layerPanel は後から代入される。クロージャが捕捉する変数として先に宣言する。
  let layerPanel: LayerPanel;

  // Initialize layer manager
  // onChange はレイヤー操作（追加・削除・移動・プロパティ変更・strokeEnd後の ImageData 保存）で発火する。
  // canvasManager.onLayerChanged() が composite → renderer 反映 → activeLayerCanvas 同期を担う。
  const layerManager = new LayerManager(canvas.width, canvas.height, () => {
    canvasManager.onLayerChanged();
    layerPanel?.refresh(); // layerPanel 代入前は undefined のため optional chaining を使用
  });
  window.layerManager = layerManager;

  // レイヤーシステムを CanvasManager に接続（描画がレイヤーと統合される）
  canvasManager.setLayerManager(layerManager);

  // Initialize UI
  const toolbar = new Toolbar(canvasManager);
  toolbar.setLayerManager(layerManager);
  window.appToolbar = toolbar;

  // Initialize undo/redo
  const undoManager = new UndoManager(300, () => toolbar.updateUndoButtons());
  canvasManager.setUndoManager(undoManager);

  layerPanel = new LayerPanel(layerManager, () => {
    canvasManager.onLayerChanged();
    layerPanel.refresh();
  });
  window.layerPanel = layerPanel;

  // Add layer panel to DOM
  const layerContainer = document.getElementById('layer-panel-container');
  if (layerContainer) {
    layerContainer.appendChild(layerPanel.getElement());
  }

  console.log(`Canvas size: ${canvas.width}x${canvas.height}`);
  console.log('LibreCanvas ready!');
}

main().catch(console.error);
