import { LayerManager } from '../layer/LayerManager';
import { Renderer } from '../renderer/Renderer';

/**
 * File format for LibreCanvas POC
 * Uses JSON with Base64-encoded image data for simplicity
 */
interface LcvFile {
  version: string;
  width: number;
  height: number;
  createdAt: string;
  modifiedAt: string;
  layers: LayerData[];
}

interface LayerData {
  id: number;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: string;
  data: string; // Base64 encoded
}

/**
 * File manager for saving and loading canvas data
 *
 * Supports:
 * - File System Access API (Chrome, Edge)
 * - Fallback download/upload (Firefox, Safari)
 * - PNG export
 */
export class FileManager {
  private fileHandle: FileSystemFileHandle | null = null;

  /**
   * Check if File System Access API is available
   */
  static isFileSystemAccessSupported(): boolean {
    return 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
  }

  /**
   * Save canvas to file
   */
  async save(renderer: Renderer, layerManager: LayerManager): Promise<void> {
    const data = this.createSaveData(renderer, layerManager);

    if (FileManager.isFileSystemAccessSupported() && this.fileHandle) {
      await this.writeToHandle(data, this.fileHandle);
    } else {
      await this.saveAs(renderer, layerManager);
    }
  }

  /**
   * Save canvas to new file
   */
  async saveAs(renderer: Renderer, layerManager: LayerManager): Promise<void> {
    const data = this.createSaveData(renderer, layerManager);

    if (FileManager.isFileSystemAccessSupported()) {
      try {
        const handle: FileSystemFileHandle = await (window as any).showSaveFilePicker({
          suggestedName: 'artwork.lcv',
          types: [
            {
              description: 'LibreCanvas File',
              accept: { 'application/json': ['.lcv'] },
            },
          ],
        });
        this.fileHandle = handle;
        await this.writeToHandle(data, handle);
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.error('Save failed:', e);
          throw e;
        }
      }
    } else {
      this.downloadFallback(data);
    }
  }

  /**
   * Load canvas from file
   */
  async load(): Promise<{ layerData: any; imageData: ImageData } | null> {
    if (FileManager.isFileSystemAccessSupported()) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'LibreCanvas File',
              accept: { 'application/json': ['.lcv'] },
            },
          ],
        });
        this.fileHandle = handle;
        const file = await handle.getFile();
        const text = await file.text();
        return this.parseFile(text);
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.error('Load failed:', e);
          throw e;
        }
        return null;
      }
    } else {
      return this.uploadFallback();
    }
  }

  /**
   * Export canvas as PNG
   */
  async exportPng(renderer: Renderer): Promise<void> {
    const imageData = renderer.getImageData();
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;

    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png');
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'artwork.png';
    a.click();
    URL.revokeObjectURL(url);
  }

  private createSaveData(renderer: Renderer, layerManager: LayerManager): LcvFile {
    const imageData = renderer.getImageData();
    const layerData = layerManager.serialize() as any;

    return {
      version: '0.1.0',
      width: imageData.width,
      height: imageData.height,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      layers: layerData.layers.map((layer: any) => ({
        id: layer.info.id,
        name: layer.info.name,
        visible: layer.info.visible,
        opacity: layer.info.opacity,
        blendMode: layer.info.blendMode,
        data: this.arrayToBase64(new Uint8Array(layer.data)),
      })),
    };
  }

  private async writeToHandle(data: LcvFile, handle: FileSystemFileHandle): Promise<void> {
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }

  private downloadFallback(data: LcvFile): void {
    const json = JSON.stringify(data);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'artwork.lcv';
    a.click();

    URL.revokeObjectURL(url);
  }

  private uploadFallback(): Promise<{ layerData: any; imageData: ImageData } | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.lcv';

      input.onchange = async () => {
        const file = input.files?.[0];
        if (file) {
          const text = await file.text();
          resolve(this.parseFile(text));
        } else {
          resolve(null);
        }
      };

      input.click();
    });
  }

  private parseFile(text: string): { layerData: any; imageData: ImageData } | null {
    try {
      const data: LcvFile = JSON.parse(text);

      // Convert back to LayerManager format
      const layerData = {
        width: data.width,
        height: data.height,
        activeLayerIndex: 0,
        layers: data.layers.map((layer) => ({
          info: {
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
          },
          data: Array.from(this.base64ToArray(layer.data)),
        })),
      };

      // Create ImageData from first layer for now
      const firstLayerData = this.base64ToArray(data.layers[0]?.data || '');
      const imageData = new ImageData(
        new Uint8ClampedArray(firstLayerData),
        data.width,
        data.height
      );

      return { layerData, imageData };
    } catch (e) {
      console.error('Failed to parse file:', e);
      return null;
    }
  }

  private arrayToBase64(array: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < array.length; i++) {
      binary += String.fromCharCode(array[i]);
    }
    return btoa(binary);
  }

  private base64ToArray(base64: string): Uint8Array {
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return array;
  }
}
