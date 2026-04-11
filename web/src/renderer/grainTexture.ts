/**
 * Procedural grain texture generation for brush textures.
 *
 * Textures are generated as tileable 512×512 RGBA Uint8Arrays using
 * multi-octave value noise. The tileability is ensured by wrapping
 * the hash function at TEX_SIZE boundaries.
 */

import type { BrushTextureType } from './Renderer';

export const TEX_SIZE = 512;

// ---------------------------------------------------------------------------
// Low-level noise primitives
// ---------------------------------------------------------------------------

/**
 * Integer hash function that wraps at TEX_SIZE, producing tileable noise.
 * Returns a pseudo-random float in [0, 1).
 */
export function hash2(ax: number, ay: number): number {
  const x = ((ax % TEX_SIZE) + TEX_SIZE) % TEX_SIZE;
  const y = ((ay % TEX_SIZE) + TEX_SIZE) % TEX_SIZE;
  let h = (x * 1619) ^ (y * 31337);
  h ^= h >>> 13;
  h = Math.imul(h, 0x4c957f2d);
  h ^= h >>> 17;
  return ((h >>> 0) & 0x7fffffff) / 0x7fffffff;
}

/**
 * Smooth (Hermite) value noise on [0, 1] input.
 * Interpolates hash values at integer grid corners.
 */
export function valueNoise(px: number, py: number): number {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  // Hermite smoothstep
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2(ix,     iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix,     iy + 1);
  const d = hash2(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy + (d - b + a - c) * ux * uy;
}

// ---------------------------------------------------------------------------
// Per-pixel grain value  (normalised float, [0, 1])
// ---------------------------------------------------------------------------

/** Pencil grain: fine multi-octave noise biased toward bright (high ink coverage). */
export function pencilGrain(nx: number, ny: number): number {
  const n =
    valueNoise(nx * 8,  ny * 8)  * 0.50 +
    valueNoise(nx * 16, ny * 16) * 0.30 +
    valueNoise(nx * 32, ny * 32) * 0.20;
  return Math.min(1, Math.pow(n, 0.35) * 1.1);
}

/** Charcoal grain: coarser noise with higher contrast between light/dark chunks. */
export function charcoalGrain(nx: number, ny: number): number {
  const n =
    valueNoise(nx * 4,  ny * 4)  * 0.55 +
    valueNoise(nx * 9,  ny * 9)  * 0.30 +
    valueNoise(nx * 18, ny * 18) * 0.15;
  return Math.min(1, Math.pow(n, 0.55) * 1.15);
}

// ---------------------------------------------------------------------------
// Texture generation
// ---------------------------------------------------------------------------

/**
 * Generate a TEX_SIZE × TEX_SIZE RGBA Uint8Array for the given brush texture.
 * Alpha is always 255; grain is stored in all three colour channels (R = G = B).
 */
export function generateGrainData(type: BrushTextureType): Uint8Array {
  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);

  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const nx = x / TEX_SIZE;
      const ny = y / TEX_SIZE;

      let val: number;
      switch (type) {
        case 'pencil':
          val = pencilGrain(nx, ny);
          break;
        case 'charcoal':
          val = charcoalGrain(nx, ny);
          break;
        case 'round':
        default:
          val = 1;
          break;
      }

      const byte = Math.round(Math.min(1, Math.max(0, val)) * 255);
      const i = (y * TEX_SIZE + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = byte;
      data[i + 3] = 255;
    }
  }

  return data;
}

/** Canvas pixels per texture tile for each brush type (controls grain density). */
export const DEFAULT_GRAIN_SCALE: Record<BrushTextureType, number> = {
  round:    1,
  pencil:   180,
  charcoal: 350,
};
