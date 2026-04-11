use wasm_bindgen::prelude::*;

/// Tile size in pixels (256x256)
pub const TILE_SIZE: usize = 256;

/// Total pixels per tile
pub const TILE_PIXELS: usize = TILE_SIZE * TILE_SIZE;

/// Bytes per tile (RGBA, 4 bytes per pixel)
pub const TILE_BYTES: usize = TILE_PIXELS * 4;

/// A single tile of the canvas (256x256 pixels)
///
/// Stores pixel data in premultiplied RGBA format.
/// Format: [R*A, G*A, B*A, A] for each pixel
#[derive(Clone)]
pub struct Tile {
    /// Pixel data in premultiplied RGBA format
    /// Layout: row-major, 4 bytes per pixel
    pub data: Vec<u8>,

    /// Whether this tile has been modified since last sync
    pub dirty: bool,
}

impl Default for Tile {
    fn default() -> Self {
        Self::new()
    }
}

impl Tile {
    /// Create a new transparent tile
    pub fn new() -> Self {
        Self {
            data: vec![0u8; TILE_BYTES],
            dirty: false,
        }
    }

    /// Create a new tile filled with white
    pub fn new_white() -> Self {
        let mut tile = Self::new();
        tile.fill(255, 255, 255, 255);
        tile
    }

    /// Fill the entire tile with a color (straight RGBA)
    pub fn fill(&mut self, r: u8, g: u8, b: u8, a: u8) {
        let alpha = a as f32 / 255.0;
        let pr = (r as f32 * alpha) as u8;
        let pg = (g as f32 * alpha) as u8;
        let pb = (b as f32 * alpha) as u8;

        for i in 0..TILE_PIXELS {
            let offset = i * 4;
            self.data[offset] = pr;
            self.data[offset + 1] = pg;
            self.data[offset + 2] = pb;
            self.data[offset + 3] = a;
        }
        self.dirty = true;
    }

    /// Get pixel at (x, y) within tile
    /// Returns [R, G, B, A] in premultiplied format
    #[inline]
    pub fn get_pixel(&self, x: usize, y: usize) -> [u8; 4] {
        debug_assert!(x < TILE_SIZE && y < TILE_SIZE);
        let offset = (y * TILE_SIZE + x) * 4;
        [
            self.data[offset],
            self.data[offset + 1],
            self.data[offset + 2],
            self.data[offset + 3],
        ]
    }

    /// Set pixel at (x, y) within tile
    /// Input should be in premultiplied RGBA format
    #[inline]
    pub fn set_pixel(&mut self, x: usize, y: usize, rgba: [u8; 4]) {
        debug_assert!(x < TILE_SIZE && y < TILE_SIZE);
        let offset = (y * TILE_SIZE + x) * 4;
        self.data[offset] = rgba[0];
        self.data[offset + 1] = rgba[1];
        self.data[offset + 2] = rgba[2];
        self.data[offset + 3] = rgba[3];
        self.dirty = true;
    }

    /// Blend a color onto pixel at (x, y) using premultiplied alpha
    /// color should be in premultiplied RGBA format [R*A, G*A, B*A, A]
    #[inline]
    pub fn blend_pixel(&mut self, x: usize, y: usize, src: [f32; 4]) {
        debug_assert!(x < TILE_SIZE && y < TILE_SIZE);
        let offset = (y * TILE_SIZE + x) * 4;

        // Get destination color
        let dst_r = self.data[offset] as f32 / 255.0;
        let dst_g = self.data[offset + 1] as f32 / 255.0;
        let dst_b = self.data[offset + 2] as f32 / 255.0;
        let dst_a = self.data[offset + 3] as f32 / 255.0;

        // Premultiplied alpha blend: dst = src + dst * (1 - src_a)
        let inv_src_a = 1.0 - src[3];
        let out_r = src[0] + dst_r * inv_src_a;
        let out_g = src[1] + dst_g * inv_src_a;
        let out_b = src[2] + dst_b * inv_src_a;
        let out_a = src[3] + dst_a * inv_src_a;

        self.data[offset] = (out_r.clamp(0.0, 1.0) * 255.0) as u8;
        self.data[offset + 1] = (out_g.clamp(0.0, 1.0) * 255.0) as u8;
        self.data[offset + 2] = (out_b.clamp(0.0, 1.0) * 255.0) as u8;
        self.data[offset + 3] = (out_a.clamp(0.0, 1.0) * 255.0) as u8;
        self.dirty = true;
    }

    /// Get raw data as slice (for GPU upload)
    pub fn data(&self) -> &[u8] {
        &self.data
    }

    /// Check if tile is completely transparent
    pub fn is_transparent(&self) -> bool {
        self.data.chunks(4).all(|pixel| pixel[3] == 0)
    }

    /// Clear dirty flag
    pub fn clear_dirty(&mut self) {
        self.dirty = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tile_creation() {
        let tile = Tile::new();
        assert_eq!(tile.data.len(), TILE_BYTES);
        assert!(tile.is_transparent());
    }

    #[test]
    fn test_tile_white() {
        let tile = Tile::new_white();
        let pixel = tile.get_pixel(0, 0);
        assert_eq!(pixel, [255, 255, 255, 255]);
    }

    #[test]
    fn test_pixel_operations() {
        let mut tile = Tile::new();

        tile.set_pixel(10, 20, [255, 128, 64, 255]);
        let pixel = tile.get_pixel(10, 20);
        assert_eq!(pixel, [255, 128, 64, 255]);
    }

    #[test]
    fn test_blend_pixel() {
        let mut tile = Tile::new_white();

        // Blend 50% red onto white
        tile.blend_pixel(0, 0, [0.5, 0.0, 0.0, 0.5]);
        let pixel = tile.get_pixel(0, 0);

        // Result should be pinkish (red blended with white)
        assert!(pixel[0] > 200); // High red
        assert!(pixel[1] > 100 && pixel[1] < 150); // Medium green
        assert!(pixel[2] > 100 && pixel[2] < 150); // Medium blue
    }
}
