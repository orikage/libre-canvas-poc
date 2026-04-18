import { CanvasManager } from '../canvas/CanvasManager';
import { FileManager } from '../file/FileManager';
import { LayerManager } from '../layer/LayerManager';

interface DocPreset {
  label: string;
  width: number;
  height: number;
  dpi: number;
}

const DOC_PRESETS: DocPreset[] = [
  { label: '4K  3840×2160 (96dpi)',   width: 3840, height: 2160, dpi: 96  },
  { label: '2K  2560×1440 (96dpi)',   width: 2560, height: 1440, dpi: 96  },
  { label: 'HD  1920×1080 (96dpi)',   width: 1920, height: 1080, dpi: 96  },
  { label: 'A4  2480×3508 (300dpi)',  width: 2480, height: 3508, dpi: 300 },
  { label: 'A4  4961×7016 (600dpi)',  width: 4961, height: 7016, dpi: 600 },
  { label: 'SQ  4096×4096',           width: 4096, height: 4096, dpi: 96  },
];

export class Toolbar {
  private container: HTMLElement;
  private canvasManager: CanvasManager;
  private fileManager: FileManager;
  private layerManager: LayerManager | null = null;

  constructor(canvasManager: CanvasManager) {
    this.canvasManager = canvasManager;
    this.fileManager = new FileManager();
    this.container = this.createToolbar();
    const toolbarContainer = document.getElementById('toolbar-container');
    if (toolbarContainer) {
      toolbarContainer.appendChild(this.container);
    } else {
      document.body.insertBefore(this.container, document.body.firstChild);
    }
  }

  setLayerManager(layerManager: LayerManager): void {
    this.layerManager = layerManager;
  }

  public updateUndoButtons(): void {
    const undoBtn = this.container.querySelector('#undo-btn') as HTMLButtonElement | null;
    const redoBtn = this.container.querySelector('#redo-btn') as HTMLButtonElement | null;
    if (undoBtn) undoBtn.disabled = !this.canvasManager.canUndo();
    if (redoBtn) redoBtn.disabled = !this.canvasManager.canRedo();
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.id = 'toolbar';
    const presetOptions = DOC_PRESETS.map((p, i) =>
      `<option value="${i}">${p.label}</option>`
    ).join('');

    toolbar.innerHTML = `
      <div class="toolbar-group file-group">
        <button id="save-btn" title="Save (Ctrl+S)">Save</button>
        <button id="load-btn" title="Load">Load</button>
        <button id="export-btn" title="Export PNG">Export</button>
      </div>
      <div class="toolbar-divider"></div>
      <div class="toolbar-group">
        <button id="undo-btn" title="Undo (Ctrl+Z)" disabled>Undo</button>
        <button id="redo-btn" title="Redo (Ctrl+Y)" disabled>Redo</button>
      </div>
      <div class="toolbar-divider"></div>
      <div class="toolbar-group">
        <label>
          <span>Document</span>
          <select id="doc-preset">${presetOptions}</select>
        </label>
      </div>
      <div class="toolbar-divider"></div>
      <div class="toolbar-group">
        <label>
          <span>Brush Size</span>
          <input type="range" id="brush-size" min="0" max="100" value="26">
          <input type="number" id="brush-size-num" min="1" max="8192" value="10" style="width:56px;background:#333;color:#eee;border:1px solid #555;border-radius:3px;padding:2px 4px;">
          <span id="brush-size-value">px</span>
        </label>
      </div>
      <div class="toolbar-group">
        <label>
          <span>Texture</span>
          <select id="brush-texture">
            <option value="round">Round</option>
            <option value="pencil">Pencil (SAI)</option>
            <option value="charcoal">Charcoal</option>
          </select>
        </label>
      </div>
      <div class="toolbar-group">
        <label>
          <span>Color</span>
          <input type="color" id="brush-color" value="#000000">
        </label>
      </div>
      <div class="toolbar-group">
        <label>
          <span>Opacity</span>
          <input type="range" id="brush-opacity" min="1" max="100" value="100">
          <span id="brush-opacity-value">100%</span>
        </label>
      </div>
      <div class="toolbar-group">
        <label>
          <span>Hardness</span>
          <input type="range" id="brush-hardness" min="0" max="100" value="70">
          <span id="brush-hardness-value">70%</span>
        </label>
      </div>
      <div class="toolbar-group">
        <label>
          <span>Smoothing</span>
          <input type="range" id="smoothing" min="1" max="100" value="40">
          <span id="smoothing-value">40%</span>
        </label>
      </div>
      <div class="toolbar-group">
        <label>
          <span>Pressure</span>
          <input type="range" id="pressure-gamma" min="10" max="200" value="50">
          <span id="pressure-gamma-value">0.50</span>
        </label>
      </div>
      <div class="toolbar-divider"></div>
      <div class="toolbar-group">
        <label>
          <span>Color Mixing</span>
          <input type="checkbox" id="color-mixing-toggle">
        </label>
      </div>
      <div class="toolbar-group">
        <label>
          <span>Pickup</span>
          <input type="range" id="color-mix-rate" min="0" max="100" value="50" disabled>
          <span id="color-mix-rate-value">50%</span>
        </label>
      </div>
      <div class="toolbar-group">
        <button id="clear-btn">Clear</button>
      </div>
      <div class="toolbar-info">
        <span id="wasm-status"></span>
      </div>
    `;

    this.setupEventListeners(toolbar);
    this.updateWasmStatus(toolbar);

    return toolbar;
  }

  private setupEventListeners(toolbar: HTMLElement): void {
    // Document preset
    const docSelect = toolbar.querySelector('#doc-preset') as HTMLSelectElement;
    docSelect.addEventListener('change', () => {
      const preset = DOC_PRESETS[parseInt(docSelect.value)];
      if (!preset) return;
      const msg = `キャンバスを ${preset.width}×${preset.height} (${preset.dpi}dpi) にリセットします。\n現在の描画は消えます。続けますか？`;
      if (!confirm(msg)) {
        // Revert selector to current canvas size
        const current = DOC_PRESETS.findIndex(
          p => p.width === this.canvasManager.getCanvas().width &&
               p.height === this.canvasManager.getCanvas().height
        );
        docSelect.value = String(current >= 0 ? current : 0);
        return;
      }
      this.canvasManager.resize(preset.width, preset.height);
      if (this.layerManager) {
        this.layerManager.resetToSize(preset.width, preset.height);
      }
      this.canvasManager.clearUndoHistory();
    });

    // File operations
    const saveBtn = toolbar.querySelector('#save-btn') as HTMLButtonElement;
    saveBtn.addEventListener('click', () => this.handleSave());

    const loadBtn = toolbar.querySelector('#load-btn') as HTMLButtonElement;
    loadBtn.addEventListener('click', () => this.handleLoad());

    const exportBtn = toolbar.querySelector('#export-btn') as HTMLButtonElement;
    exportBtn.addEventListener('click', () => this.handleExport());

    // Undo/Redo buttons
    const undoBtn = toolbar.querySelector('#undo-btn') as HTMLButtonElement;
    const redoBtn = toolbar.querySelector('#redo-btn') as HTMLButtonElement;
    undoBtn.addEventListener('click', () => this.canvasManager.undo());
    redoBtn.addEventListener('click', () => this.canvasManager.redo());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Skip when focused on text inputs to preserve native undo behavior
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          this.canvasManager.undo();
        } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault();
          this.canvasManager.redo();
        } else if (e.key === 's') {
          e.preventDefault();
          this.handleSave();
        } else if (e.key === 'o') {
          e.preventDefault();
          this.handleLoad();
        }
      }
    });

    // Brush size (logarithmic: slider 0-100 → 1-8192 px)
    const sizeSlider = toolbar.querySelector('#brush-size') as HTMLInputElement;
    const sizeNum   = toolbar.querySelector('#brush-size-num') as HTMLInputElement;
    const sizeValue = toolbar.querySelector('#brush-size-value') as HTMLSpanElement;

    const MAX_SIZE = 8192;
    const sliderToSize = (t: number) => Math.max(1, Math.round(Math.pow(MAX_SIZE, t / 100)));
    const sizeToSlider = (s: number) => Math.round(Math.log(Math.max(1, s)) / Math.log(MAX_SIZE) * 100);

    const applySize = (px: number) => {
      const clamped = Math.max(1, Math.min(MAX_SIZE, px));
      this.canvasManager.setBrushSize(clamped);
      sizeNum.value = String(clamped);
      sizeSlider.value = String(sizeToSlider(clamped));
    };

    sizeSlider.addEventListener('input', () => applySize(sliderToSize(parseInt(sizeSlider.value))));
    sizeNum.addEventListener('change', () => applySize(parseInt(sizeNum.value) || 1));

    // Brush texture
    const textureSelect = toolbar.querySelector('#brush-texture') as HTMLSelectElement;
    textureSelect.addEventListener('change', () => {
      this.canvasManager.setBrushTexture(textureSelect.value as 'round' | 'pencil' | 'charcoal');
    });

    // Color
    const colorPicker = toolbar.querySelector('#brush-color') as HTMLInputElement;
    colorPicker.addEventListener('input', () => {
      const hex = colorPicker.value;
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      this.canvasManager.setBrushColor(r, g, b, 1);
    });

    // Smoothing
    const smoothingSlider = toolbar.querySelector('#smoothing') as HTMLInputElement;
    const smoothingValue = toolbar.querySelector('#smoothing-value') as HTMLSpanElement;

    smoothingSlider.addEventListener('input', () => {
      const value = parseInt(smoothingSlider.value);
      const alpha = value / 100;
      this.canvasManager.setSmoothing(alpha, 3);
      smoothingValue.textContent = `${value}%`;
    });

    // Opacity
    const opacitySlider = toolbar.querySelector('#brush-opacity') as HTMLInputElement;
    const opacityValue = toolbar.querySelector('#brush-opacity-value') as HTMLSpanElement;
    opacitySlider.addEventListener('input', () => {
      const value = parseInt(opacitySlider.value);
      this.canvasManager.setOpacity(value / 100);
      opacityValue.textContent = `${value}%`;
    });

    // Hardness
    const hardnessSlider = toolbar.querySelector('#brush-hardness') as HTMLInputElement;
    const hardnessValue = toolbar.querySelector('#brush-hardness-value') as HTMLSpanElement;
    hardnessSlider.addEventListener('input', () => {
      const value = parseInt(hardnessSlider.value);
      this.canvasManager.setHardness(value / 100);
      hardnessValue.textContent = `${value}%`;
    });

    // Pressure curve (gamma: slider 10-200 → 0.1-2.0)
    const gammaSlider = toolbar.querySelector('#pressure-gamma') as HTMLInputElement;
    const gammaValue = toolbar.querySelector('#pressure-gamma-value') as HTMLSpanElement;
    gammaSlider.addEventListener('input', () => {
      const raw = parseInt(gammaSlider.value);
      const gamma = raw / 100;
      this.canvasManager.setPressureGamma(gamma);
      gammaValue.textContent = gamma.toFixed(2);
    });

    // Color mixing (Kubelka-Munk)
    const mixToggle = toolbar.querySelector('#color-mixing-toggle') as HTMLInputElement;
    const mixRateSlider = toolbar.querySelector('#color-mix-rate') as HTMLInputElement;
    const mixRateValue = toolbar.querySelector('#color-mix-rate-value') as HTMLSpanElement;

    mixToggle.addEventListener('change', () => {
      this.canvasManager.setColorMixing(mixToggle.checked);
      mixRateSlider.disabled = !mixToggle.checked;
    });

    mixRateSlider.addEventListener('input', () => {
      const value = parseInt(mixRateSlider.value);
      this.canvasManager.setColorMixRate(value / 100);
      mixRateValue.textContent = `${value}%`;
    });

    // Clear button
    const clearBtn = toolbar.querySelector('#clear-btn') as HTMLButtonElement;
    clearBtn.addEventListener('click', () => {
      this.canvasManager.clear();
    });
  }

  private async handleSave(): Promise<void> {
    if (!this.layerManager) {
      console.warn('LayerManager not set');
      return;
    }
    try {
      await this.fileManager.save(
        this.canvasManager.getRenderer(),
        this.layerManager
      );
      console.log('File saved');
    } catch (e) {
      console.error('Save failed:', e);
    }
  }

  private async handleLoad(): Promise<void> {
    if (!this.layerManager) {
      console.warn('LayerManager not set');
      return;
    }
    try {
      const loaded = await this.fileManager.load();
      if (loaded) {
        // in-place 置換: 既存の layerManager 参照（CanvasManager・LayerPanel も含む）を
        // 無効化せずに内容だけ差し替える。onChange が自動発火してレンダラー・UI を同期する。
        this.layerManager.replaceWith(loaded);
        this.canvasManager.clearUndoHistory();
        console.log('File loaded');
      }
    } catch (e) {
      console.error('Load failed:', e);
    }
  }

  private async handleExport(): Promise<void> {
    try {
      await this.fileManager.exportPng(this.canvasManager.getRenderer());
      console.log('PNG exported');
    } catch (e) {
      console.error('Export failed:', e);
    }
  }

  private updateWasmStatus(toolbar: HTMLElement): void {
    const statusEl = toolbar.querySelector('#wasm-status') as HTMLSpanElement;
    const rendererType = this.canvasManager.getRendererType();
    const wasmOn = this.canvasManager.isWasmEnabled();
    const gpuLabel = rendererType === 'webgpu' ? 'WebGPU' : 'Canvas2D';
    const wasmLabel = wasmOn ? 'Wasm: ON' : 'Wasm: OFF';
    statusEl.textContent = `${gpuLabel} | ${wasmLabel}`;
    statusEl.classList.add(rendererType === 'webgpu' ? 'wasm-on' : '');
    if (wasmOn) statusEl.classList.add('wasm-on');
    else statusEl.classList.add('wasm-off');
  }

  public destroy(): void {
    this.container.remove();
  }
}
