use std::collections::HashMap;
use wasm_bindgen::prelude::*;

use super::tile::{Tile, TILE_SIZE};

/// Tile coordinate (column, row)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct TileKey {
    pub col: i32,
    pub row: i32,
}

impl TileKey {
    pub fn new(col: i32, row: i32) -> Self {
        Self { col, row }
    }

    /// Create tile key from pixel coordinates
    pub fn from_pixel(x: f32, y: f32) -> Self {
        Self {
            col: (x / TILE_SIZE as f32).floor() as i32,
            row: (y / TILE_SIZE as f32).floor() as i32,
        }
    }

    /// Convert to unique hash key
    pub fn to_hash(&self) -> u64 {
        // Morton code-like interleaving for better cache locality
        let col = self.col as u64;
        let row = self.row as u64;
        (col << 32) | (row & 0xFFFFFFFF)
    }
}

/// Sparse tile-based canvas using HashMap for storage
///
/// Only stores tiles that have been drawn on, saving memory
/// for large canvases with sparse content.
#[wasm_bindgen]
pub struct SparseCanvas {
    /// Tile storage
    tiles: HashMap<u64, Tile>,

    /// List of dirty tile keys (for incremental updates)
    dirty_tiles: Vec<u64>,

    /// Canvas dimensions in pixels
    width: u32,
    height: u32,

    /// Background color (straight RGBA)
    background: [u8; 4],
}

#[wasm_bindgen]
impl SparseCanvas {
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            tiles: HashMap::new(),
            dirty_tiles: Vec::new(),
            width,
            height,
            background: [255, 255, 255, 255], // White
        }
    }

    /// Get canvas width
    pub fn width(&self) -> u32 {
        self.width
    }

    /// Get canvas height
    pub fn height(&self) -> u32 {
        self.height
    }

    /// Get number of allocated tiles
    pub fn tile_count(&self) -> usize {
        self.tiles.len()
    }

    /// Clear all tiles
    pub fn clear(&mut self) {
        self.tiles.clear();
        self.dirty_tiles.clear();
    }

    /// Set background color
    pub fn set_background(&mut self, r: u8, g: u8, b: u8, a: u8) {
        self.background = [r, g, b, a];
    }
}

impl SparseCanvas {
    /// Get or create a tile at the given coordinates
    pub fn get_or_create_tile(&mut self, key: TileKey) -> &mut Tile {
        let hash = key.to_hash();

        self.tiles.entry(hash).or_insert_with(|| {
            let mut tile = Tile::new();
            // Fill with background color
            tile.fill(
                self.background[0],
                self.background[1],
                self.background[2],
                self.background[3],
            );
            tile
        })
    }

    /// Get a tile if it exists
    pub fn get_tile(&self, key: TileKey) -> Option<&Tile> {
        self.tiles.get(&key.to_hash())
    }

    /// Mark a tile as dirty
    pub fn mark_dirty(&mut self, key: TileKey) {
        let hash = key.to_hash();
        if !self.dirty_tiles.contains(&hash) {
            self.dirty_tiles.push(hash);
        }
    }

    /// Get all dirty tiles and clear the dirty list
    pub fn take_dirty_tiles(&mut self) -> Vec<(TileKey, Vec<u8>)> {
        let mut result = Vec::new();

        for &hash in &self.dirty_tiles {
            if let Some(tile) = self.tiles.get_mut(&hash) {
                let col = (hash >> 32) as i32;
                let row = (hash & 0xFFFFFFFF) as i32;
                tile.clear_dirty();
                result.push((TileKey::new(col, row), tile.data().to_vec()));
            }
        }

        self.dirty_tiles.clear();
        result
    }

    /// Get tiles that intersect with a bounding box
    pub fn get_tiles_in_rect(
        &self,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
    ) -> Vec<(TileKey, &Tile)> {
        let min_key = TileKey::from_pixel(x, y);
        let max_key = TileKey::from_pixel(x + width, y + height);

        let mut result = Vec::new();

        for col in min_key.col..=max_key.col {
            for row in min_key.row..=max_key.row {
                let key = TileKey::new(col, row);
                if let Some(tile) = self.get_tile(key) {
                    result.push((key, tile));
                }
            }
        }

        result
    }

    /// Draw a point (single pixel or small circle) at coordinates
    pub fn draw_point(&mut self, x: f32, y: f32, color: [f32; 4], radius: f32) {
        let min_x = (x - radius).max(0.0) as i32;
        let max_x = (x + radius).min(self.width as f32) as i32;
        let min_y = (y - radius).max(0.0) as i32;
        let max_y = (y + radius).min(self.height as f32) as i32;

        let radius_sq = radius * radius;

        for py in min_y..=max_y {
            for px in min_x..=max_x {
                let dx = px as f32 - x;
                let dy = py as f32 - y;
                let dist_sq = dx * dx + dy * dy;

                if dist_sq <= radius_sq {
                    // Calculate falloff
                    let falloff = 1.0 - (dist_sq / radius_sq).sqrt();
                    let alpha = color[3] * falloff;

                    if alpha > 0.001 {
                        let key = TileKey::from_pixel(px as f32, py as f32);
                        let tile = self.get_or_create_tile(key);

                        let local_x = (px as usize) % TILE_SIZE;
                        let local_y = (py as usize) % TILE_SIZE;

                        // Premultiplied color with falloff
                        let premul_color = [
                            color[0] * alpha,
                            color[1] * alpha,
                            color[2] * alpha,
                            alpha,
                        ];

                        tile.blend_pixel(local_x, local_y, premul_color);
                        self.mark_dirty(key);
                    }
                }
            }
        }
    }

    /// Iterator over all tiles
    pub fn iter_tiles(&self) -> impl Iterator<Item = (TileKey, &Tile)> {
        self.tiles.iter().map(|(&hash, tile)| {
            let col = (hash >> 32) as i32;
            let row = (hash & 0xFFFFFFFF) as i32;
            (TileKey::new(col, row), tile)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_canvas_creation() {
        let canvas = SparseCanvas::new(1920, 1080);
        assert_eq!(canvas.width(), 1920);
        assert_eq!(canvas.height(), 1080);
        assert_eq!(canvas.tile_count(), 0);
    }

    #[test]
    fn test_tile_key_from_pixel() {
        let key = TileKey::from_pixel(300.0, 500.0);
        assert_eq!(key.col, 1); // 300 / 256 = 1
        assert_eq!(key.row, 1); // 500 / 256 = 1
    }

    #[test]
    fn test_get_or_create_tile() {
        let mut canvas = SparseCanvas::new(1920, 1080);

        let key = TileKey::new(0, 0);
        let _tile = canvas.get_or_create_tile(key);

        assert_eq!(canvas.tile_count(), 1);
    }

    #[test]
    fn test_draw_point() {
        let mut canvas = SparseCanvas::new(1920, 1080);

        canvas.draw_point(100.0, 100.0, [1.0, 0.0, 0.0, 1.0], 5.0);

        assert!(canvas.tile_count() > 0);
    }
}

#[cfg(test)]
mod benches {
    extern crate test;
    use test::Bencher;
    use super::*;
    use crate::input::SmoothPoint;
    use crate::stroke::DabGenerator;

    const RED: [f32; 4] = [1.0, 0.0, 0.0, 1.0];

    #[bench]
    fn bench_draw_point_small_radius(b: &mut Bencher) {
        let mut canvas = SparseCanvas::new(1920, 1080);
        b.iter(|| {
            canvas.draw_point(
                test::black_box(500.0),
                test::black_box(500.0),
                test::black_box(RED),
                test::black_box(5.0),
            );
        });
    }

    #[bench]
    fn bench_draw_point_large_radius(b: &mut Bencher) {
        let mut canvas = SparseCanvas::new(1920, 1080);
        b.iter(|| {
            canvas.draw_point(
                test::black_box(500.0),
                test::black_box(500.0),
                test::black_box(RED),
                test::black_box(50.0),
            );
        });
    }

    #[bench]
    fn bench_full_stroke_100_dabs(b: &mut Bencher) {
        // ダブ生成はタイミング外で事前実行
        let mut gen = DabGenerator::new(10.0, 0.25);
        let smooth_pts: Vec<SmoothPoint> = (0..100)
            .map(|i| SmoothPoint::new(i as f32 * 8.0 + 100.0, 300.0, 0.8))
            .collect();
        let mut dabs = Vec::new();
        for sp in &smooth_pts {
            dabs.extend(gen.generate(*sp));
        }

        b.iter(|| {
            let mut canvas = SparseCanvas::new(1920, 1080);
            for dab in &dabs {
                canvas.draw_point(
                    test::black_box(dab.x),
                    test::black_box(dab.y),
                    test::black_box(RED),
                    test::black_box(dab.size * 0.5),
                );
            }
            test::black_box(canvas.tile_count());
        });
    }
}
