import { LayerManager, BlendMode, LayerInfo } from '../layer/LayerManager';

export class LayerPanel {
  private container: HTMLElement;
  private layerManager: LayerManager;
  private onLayerChange: () => void;

  constructor(layerManager: LayerManager, onLayerChange: () => void) {
    this.layerManager = layerManager;
    this.onLayerChange = onLayerChange;
    this.container = this.createPanel();
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'layer-panel';
    panel.innerHTML = `
      <div class="layer-panel-header">
        <span>Layers</span>
        <div class="layer-panel-actions">
          <button id="add-layer-btn" title="Add Layer">+</button>
          <button id="remove-layer-btn" title="Remove Layer">-</button>
        </div>
      </div>
      <div class="layer-list"></div>
    `;

    this.container = panel; // assign before render() so querySelector works
    this.setupEventListeners(panel);
    this.render();

    return panel;
  }

  private setupEventListeners(panel: HTMLElement): void {
    // Add layer
    panel.querySelector('#add-layer-btn')?.addEventListener('click', () => {
      const count = this.layerManager.getLayerCount();
      this.layerManager.addLayer(`Layer ${count + 1}`);
      this.render();
      this.onLayerChange();
    });

    // Remove layer
    panel.querySelector('#remove-layer-btn')?.addEventListener('click', () => {
      const index = this.layerManager.getActiveLayerIndex();
      if (this.layerManager.removeLayer(index)) {
        this.render();
        this.onLayerChange();
      }
    });
  }

  private render(): void {
    const listEl = this.container.querySelector('.layer-list');
    if (!listEl) return;

    const layers = this.layerManager.getAllLayerInfo();
    const activeIndex = this.layerManager.getActiveLayerIndex();

    // Render in reverse order (top layer first in UI)
    listEl.innerHTML = layers
      .map((layer, index) => this.renderLayerItem(layer, index, index === activeIndex))
      .reverse()
      .join('');

    // Setup event listeners for each layer item
    listEl.querySelectorAll('.layer-item').forEach((item) => {
      const index = parseInt(item.getAttribute('data-index') || '0');

      // Click to select
      item.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.layer-visibility, .layer-controls')) {
          return;
        }
        this.layerManager.setActiveLayer(index);
        this.render();
        this.onLayerChange();
      });

      // Visibility toggle
      item.querySelector('.layer-visibility')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const info = this.layerManager.getLayerInfo(index);
        if (info) {
          this.layerManager.setLayerVisible(index, !info.visible);
          this.render();
          this.onLayerChange();
        }
      });

      // Opacity slider
      item.querySelector('.opacity-slider')?.addEventListener('input', (e) => {
        const value = parseInt((e.target as HTMLInputElement).value);
        this.layerManager.setLayerOpacity(index, value / 100);
        this.onLayerChange();
      });

      // Blend mode select
      item.querySelector('.blend-mode-select')?.addEventListener('change', (e) => {
        const mode = (e.target as HTMLSelectElement).value as BlendMode;
        this.layerManager.setLayerBlendMode(index, mode);
        this.onLayerChange();
      });

      // Move up
      item.querySelector('.move-up-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (index < this.layerManager.getLayerCount() - 1) {
          this.layerManager.moveLayer(index, index + 1);
          this.render();
          this.onLayerChange();
        }
      });

      // Move down
      item.querySelector('.move-down-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (index > 0) {
          this.layerManager.moveLayer(index, index - 1);
          this.render();
          this.onLayerChange();
        }
      });
    });
  }

  private renderLayerItem(layer: LayerInfo, index: number, isActive: boolean): string {
    const opacityPercent = Math.round(layer.opacity * 100);

    return `
      <div class="layer-item ${isActive ? 'active' : ''}" data-index="${index}">
        <div class="layer-visibility" title="Toggle visibility">
          ${layer.visible ? '👁' : '○'}
        </div>
        <div class="layer-main">
          <div class="layer-name">${this.escapeHtml(layer.name)}</div>
          <div class="layer-controls">
            <input type="range" class="opacity-slider" min="0" max="100" value="${opacityPercent}" title="Opacity">
            <select class="blend-mode-select" title="Blend mode">
              <option value="normal" ${layer.blendMode === 'normal' ? 'selected' : ''}>Normal</option>
              <option value="multiply" ${layer.blendMode === 'multiply' ? 'selected' : ''}>Multiply</option>
              <option value="screen" ${layer.blendMode === 'screen' ? 'selected' : ''}>Screen</option>
              <option value="overlay" ${layer.blendMode === 'overlay' ? 'selected' : ''}>Overlay</option>
            </select>
            <button class="move-up-btn" title="Move up">↑</button>
            <button class="move-down-btn" title="Move down">↓</button>
          </div>
        </div>
        <div class="layer-opacity">${opacityPercent}%</div>
      </div>
    `;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public refresh(): void {
    this.render();
  }

  public destroy(): void {
    this.container.remove();
  }
}
