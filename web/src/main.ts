import { initWasm } from './wasm/wasmLoader';
import { CanvasManager } from './canvas/CanvasManager';
import { Toolbar } from './ui/Toolbar';
import { LayerPanel } from './ui/LayerPanel';
import { LayerManager } from './layer/LayerManager';

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

  // Initialize layer manager
  const layerManager = new LayerManager(canvas.width, canvas.height, () => {
    // Layer change callback - composite and update canvas
    // For POC, we keep drawing directly to canvas
    // Full layer support would require more integration
  });
  window.layerManager = layerManager;

  // Initialize UI
  const toolbar = new Toolbar(canvasManager);
  toolbar.setLayerManager(layerManager);
  window.appToolbar = toolbar;

  const layerPanel = new LayerPanel(layerManager, () => {
    // Refresh display when layers change
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
