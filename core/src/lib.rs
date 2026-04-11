use wasm_bindgen::prelude::*;

// Modules
pub mod brush;
pub mod canvas;
pub mod input;
pub mod layer;
pub mod stroke;

// Re-export commonly used types
pub use brush::{blend_premultiplied, to_premultiplied, BlendMode};
pub use canvas::{SparseCanvas, Tile, TILE_SIZE};
pub use input::{RawPoint, SmoothPoint};
pub use layer::{Layer, LayerStack, LayerBlendMode};
pub use stroke::{Dab, DabGenerator, StrokeSmoother};

// Initialize panic hook for better error messages
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Log a message to the browser console
#[wasm_bindgen]
pub fn log(message: &str) {
    web_sys::console::log_1(&message.into());
}

/// Get the library version
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Simple test function to verify wasm is working
#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
    }

    #[test]
    fn test_version() {
        assert_eq!(version(), "0.1.0");
    }
}
