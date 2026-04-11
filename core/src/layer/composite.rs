use wasm_bindgen::prelude::*;
use crate::brush::blend::{
    blend_premultiplied, blend_multiply, blend_screen, blend_overlay,
    to_premultiplied, from_premultiplied,
};

/// Layer blend modes
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum LayerBlendMode {
    #[default]
    Normal,
    Multiply,
    Screen,
    Overlay,
}

/// Composite a source layer onto a destination buffer
///
/// # Arguments
/// * `dst` - Destination buffer (premultiplied RGBA, will be modified)
/// * `src` - Source buffer (premultiplied RGBA)
/// * `opacity` - Layer opacity (0.0 - 1.0)
/// * `mode` - Blend mode
pub fn composite_layer(
    dst: &mut [u8],
    src: &[u8],
    opacity: f32,
    mode: LayerBlendMode,
) {
    debug_assert_eq!(dst.len(), src.len());
    debug_assert_eq!(dst.len() % 4, 0);

    let opacity = opacity.clamp(0.0, 1.0);
    if opacity < 0.001 {
        return; // Fully transparent, skip
    }

    for i in (0..dst.len()).step_by(4) {
        // Skip fully transparent source pixels
        if src[i + 3] == 0 {
            continue;
        }

        // Convert to float
        let mut dst_f = [
            dst[i] as f32 / 255.0,
            dst[i + 1] as f32 / 255.0,
            dst[i + 2] as f32 / 255.0,
            dst[i + 3] as f32 / 255.0,
        ];

        let src_f = [
            src[i] as f32 / 255.0 * opacity,
            src[i + 1] as f32 / 255.0 * opacity,
            src[i + 2] as f32 / 255.0 * opacity,
            src[i + 3] as f32 / 255.0 * opacity,
        ];

        // Apply blend mode
        match mode {
            LayerBlendMode::Normal => blend_premultiplied(&mut dst_f, src_f),
            LayerBlendMode::Multiply => blend_multiply(&mut dst_f, src_f),
            LayerBlendMode::Screen => blend_screen(&mut dst_f, src_f),
            LayerBlendMode::Overlay => blend_overlay(&mut dst_f, src_f),
        }

        // Convert back to bytes
        dst[i] = (dst_f[0].clamp(0.0, 1.0) * 255.0) as u8;
        dst[i + 1] = (dst_f[1].clamp(0.0, 1.0) * 255.0) as u8;
        dst[i + 2] = (dst_f[2].clamp(0.0, 1.0) * 255.0) as u8;
        dst[i + 3] = (dst_f[3].clamp(0.0, 1.0) * 255.0) as u8;
    }
}

/// Composite multiple layers into a single output buffer
///
/// Layers are composited from bottom to top (index 0 is bottom).
pub fn composite_layers(
    layers: &[(& [u8], f32, bool, LayerBlendMode)], // (data, opacity, visible, mode)
    width: u32,
    height: u32,
) -> Vec<u8> {
    let size = (width * height * 4) as usize;
    let mut output = vec![255u8; size]; // Start with white background

    // Initialize as white (opaque)
    for i in (0..size).step_by(4) {
        output[i] = 255;     // R
        output[i + 1] = 255; // G
        output[i + 2] = 255; // B
        output[i + 3] = 255; // A
    }

    // Composite each visible layer
    for (data, opacity, visible, mode) in layers {
        if !visible || *opacity < 0.001 {
            continue;
        }

        composite_layer(&mut output, data, *opacity, *mode);
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_composite_normal() {
        let mut dst = [255, 255, 255, 255]; // White
        let src = [255, 0, 0, 255]; // Red

        composite_layer(&mut dst, &src, 1.0, LayerBlendMode::Normal);

        // Should be red (opaque red over white)
        assert_eq!(dst[0], 255); // R
        assert_eq!(dst[1], 0);   // G
        assert_eq!(dst[2], 0);   // B
        assert_eq!(dst[3], 255); // A
    }

    #[test]
    fn test_composite_with_opacity() {
        let mut dst = [255, 255, 255, 255]; // White
        let src = [255, 0, 0, 255]; // Red

        composite_layer(&mut dst, &src, 0.5, LayerBlendMode::Normal);

        // Should be pinkish (50% red over white)
        assert!(dst[0] >= 250); // High R
        assert!(dst[1] >= 100 && dst[1] <= 150); // Medium G
        assert!(dst[2] >= 100 && dst[2] <= 150); // Medium B
    }

    #[test]
    fn test_composite_invisible() {
        let mut dst = [255, 255, 255, 255]; // White
        let src = [255, 0, 0, 255]; // Red

        composite_layer(&mut dst, &src, 0.0, LayerBlendMode::Normal);

        // Should remain white (0% opacity)
        assert_eq!(dst, [255, 255, 255, 255]);
    }
}
