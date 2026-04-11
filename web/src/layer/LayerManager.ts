export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';

export interface LayerInfo {
  id: number;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
}

export interface LayerData {
  info: LayerInfo;
  imageData: ImageData;
}

/**
 * Manages layers for the canvas.
 *
 * In POC phase, this is a simplified TypeScript-only implementation.
 * Future versions will use Rust/Wasm for layer compositing.
 */
export class LayerManager {
  private layers: LayerData[] = [];
  private activeLayerIndex = 0;
  private nextId = 1;
  private width: number;
  private height: number;
  private onChange: () => void;

  constructor(width: number, height: number, onChange: () => void = () => {}) {
    this.width = width;
    this.height = height;
    this.onChange = onChange;

    // Create initial background layer
    this.addLayer('Background');
  }

  getLayerCount(): number {
    return this.layers.length;
  }

  getActiveLayerIndex(): number {
    return this.activeLayerIndex;
  }

  setActiveLayer(index: number): void {
    if (index >= 0 && index < this.layers.length) {
      this.activeLayerIndex = index;
      this.onChange();
    }
  }

  getLayerInfo(index: number): LayerInfo | null {
    return this.layers[index]?.info ?? null;
  }

  getAllLayerInfo(): LayerInfo[] {
    return this.layers.map((l) => ({ ...l.info }));
  }

  addLayer(name: string): number {
    const id = this.nextId++;
    const imageData = new ImageData(this.width, this.height);

    // Initialize as transparent
    // (ImageData is initialized to transparent black by default)

    this.layers.push({
      info: {
        id,
        name,
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
      },
      imageData,
    });

    this.activeLayerIndex = this.layers.length - 1;
    this.onChange();
    return id;
  }

  removeLayer(index: number): boolean {
    if (this.layers.length <= 1 || index < 0 || index >= this.layers.length) {
      return false;
    }

    this.layers.splice(index, 1);

    if (this.activeLayerIndex >= this.layers.length) {
      this.activeLayerIndex = this.layers.length - 1;
    }

    this.onChange();
    return true;
  }

  moveLayer(from: number, to: number): boolean {
    if (
      from < 0 ||
      from >= this.layers.length ||
      to < 0 ||
      to >= this.layers.length
    ) {
      return false;
    }

    const [layer] = this.layers.splice(from, 1);
    this.layers.splice(to, 0, layer);

    // Update active index
    if (this.activeLayerIndex === from) {
      this.activeLayerIndex = to;
    } else if (from < this.activeLayerIndex && to >= this.activeLayerIndex) {
      this.activeLayerIndex--;
    } else if (from > this.activeLayerIndex && to <= this.activeLayerIndex) {
      this.activeLayerIndex++;
    }

    this.onChange();
    return true;
  }

  setLayerName(index: number, name: string): void {
    if (this.layers[index]) {
      this.layers[index].info.name = name;
      this.onChange();
    }
  }

  setLayerVisible(index: number, visible: boolean): void {
    if (this.layers[index]) {
      this.layers[index].info.visible = visible;
      this.onChange();
    }
  }

  setLayerOpacity(index: number, opacity: number): void {
    if (this.layers[index]) {
      this.layers[index].info.opacity = Math.max(0, Math.min(1, opacity));
      this.onChange();
    }
  }

  setLayerBlendMode(index: number, mode: BlendMode): void {
    if (this.layers[index]) {
      this.layers[index].info.blendMode = mode;
      this.onChange();
    }
  }

  getActiveLayerImageData(): ImageData | null {
    return this.layers[this.activeLayerIndex]?.imageData ?? null;
  }

  setActiveLayerImageData(data: ImageData): void {
    if (this.layers[this.activeLayerIndex]) {
      this.layers[this.activeLayerIndex].imageData = data;
      this.onChange();
    }
  }

  /**
   * Composite all visible layers into a single ImageData
   */
  composite(): ImageData {
    const output = new ImageData(this.width, this.height);
    const data = output.data;

    // Initialize with white background
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;     // R
      data[i + 1] = 255; // G
      data[i + 2] = 255; // B
      data[i + 3] = 255; // A
    }

    // Composite each visible layer (bottom to top)
    for (const layer of this.layers) {
      if (!layer.info.visible || layer.info.opacity < 0.001) {
        continue;
      }

      this.compositeLayer(data, layer.imageData.data, layer.info.opacity, layer.info.blendMode);
    }

    return output;
  }

  private compositeLayer(
    dst: Uint8ClampedArray,
    src: Uint8ClampedArray,
    opacity: number,
    mode: BlendMode
  ): void {
    for (let i = 0; i < dst.length; i += 4) {
      // Skip transparent source pixels
      if (src[i + 3] === 0) continue;

      const srcA = (src[i + 3] / 255) * opacity;
      if (srcA < 0.001) continue;

      const srcR = src[i] / 255;
      const srcG = src[i + 1] / 255;
      const srcB = src[i + 2] / 255;

      const dstR = dst[i] / 255;
      const dstG = dst[i + 1] / 255;
      const dstB = dst[i + 2] / 255;
      const dstA = dst[i + 3] / 255;

      let outR: number, outG: number, outB: number;

      switch (mode) {
        case 'multiply':
          outR = dstR * srcR;
          outG = dstG * srcG;
          outB = dstB * srcB;
          break;
        case 'screen':
          outR = 1 - (1 - dstR) * (1 - srcR);
          outG = 1 - (1 - dstG) * (1 - srcG);
          outB = 1 - (1 - dstB) * (1 - srcB);
          break;
        case 'overlay':
          outR = dstR < 0.5 ? 2 * dstR * srcR : 1 - 2 * (1 - dstR) * (1 - srcR);
          outG = dstG < 0.5 ? 2 * dstG * srcG : 1 - 2 * (1 - dstG) * (1 - srcG);
          outB = dstB < 0.5 ? 2 * dstB * srcB : 1 - 2 * (1 - dstB) * (1 - srcB);
          break;
        case 'normal':
        default:
          outR = srcR;
          outG = srcG;
          outB = srcB;
          break;
      }

      // Alpha blend
      const invSrcA = 1 - srcA;
      dst[i] = Math.round((outR * srcA + dstR * invSrcA) * 255);
      dst[i + 1] = Math.round((outG * srcA + dstG * invSrcA) * 255);
      dst[i + 2] = Math.round((outB * srcA + dstB * invSrcA) * 255);
      dst[i + 3] = Math.round((srcA + dstA * invSrcA) * 255);
    }
  }

  /**
   * Reset to a blank document at a new size (discards all layer content).
   */
  resetToSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.layers = [];
    this.activeLayerIndex = 0;
    this.nextId = 1;
    this.addLayer('Background');
  }

  getWidth(): number { return this.width; }
  getHeight(): number { return this.height; }

  /**
   * Serialize layers for saving
   */
  serialize(): object {
    return {
      width: this.width,
      height: this.height,
      activeLayerIndex: this.activeLayerIndex,
      layers: this.layers.map((layer) => ({
        info: layer.info,
        data: Array.from(layer.imageData.data),
      })),
    };
  }

  /**
   * Deserialize layers from saved data
   */
  static deserialize(data: any, onChange: () => void = () => {}): LayerManager {
    const manager = new LayerManager(data.width, data.height, onChange);
    manager.layers = [];
    manager.nextId = 1;

    for (const layerData of data.layers) {
      const imageData = new ImageData(
        new Uint8ClampedArray(layerData.data),
        data.width,
        data.height
      );

      manager.layers.push({
        info: layerData.info,
        imageData,
      });

      if (layerData.info.id >= manager.nextId) {
        manager.nextId = layerData.info.id + 1;
      }
    }

    manager.activeLayerIndex = data.activeLayerIndex;
    return manager;
  }
}
