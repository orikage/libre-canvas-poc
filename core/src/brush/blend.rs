use wasm_bindgen::prelude::*;

/// Blend modes supported by the brush engine
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BlendMode {
    Normal,
    Multiply,
    Screen,
    Overlay,
}

impl Default for BlendMode {
    fn default() -> Self {
        BlendMode::Normal
    }
}

/// Convert straight RGBA to premultiplied RGBA
///
/// Input: [R, G, B, A] where each is 0.0-1.0
/// Output: [R*A, G*A, B*A, A]
#[inline]
pub fn to_premultiplied(color: [f32; 4]) -> [f32; 4] {
    let a = color[3];
    [color[0] * a, color[1] * a, color[2] * a, a]
}

/// Convert premultiplied RGBA back to straight RGBA
///
/// Input: [R*A, G*A, B*A, A]
/// Output: [R, G, B, A]
#[inline]
pub fn from_premultiplied(color: [f32; 4]) -> [f32; 4] {
    let a = color[3];
    if a < 0.0001 {
        [0.0, 0.0, 0.0, 0.0]
    } else {
        [color[0] / a, color[1] / a, color[2] / a, a]
    }
}

/// Premultiplied alpha blending (Normal mode)
///
/// This is the correct formula for compositing with premultiplied alpha:
/// dst = src + dst × (1 - src_a)
///
/// CRITICAL: This prevents "muddy color" artifacts that occur with
/// straight alpha blending.
///
/// Both src and dst must be in premultiplied format.
#[inline]
pub fn blend_premultiplied(dst: &mut [f32; 4], src: [f32; 4]) {
    let inv_src_a = 1.0 - src[3];
    dst[0] = src[0] + dst[0] * inv_src_a;
    dst[1] = src[1] + dst[1] * inv_src_a;
    dst[2] = src[2] + dst[2] * inv_src_a;
    dst[3] = src[3] + dst[3] * inv_src_a;
}

/// Multiply blend mode
///
/// Result = Base × Blend
/// Dark colors darken, white is transparent
#[inline]
pub fn blend_multiply(dst: &mut [f32; 4], src: [f32; 4]) {
    // Convert to straight alpha for blending calculation
    let dst_straight = from_premultiplied(*dst);
    let src_straight = from_premultiplied(src);

    let result = [
        dst_straight[0] * src_straight[0],
        dst_straight[1] * src_straight[1],
        dst_straight[2] * src_straight[2],
        dst_straight[3], // Keep destination alpha
    ];

    // Apply as overlay with source alpha
    let premul_result = to_premultiplied([
        result[0],
        result[1],
        result[2],
        src_straight[3],
    ]);

    blend_premultiplied(dst, premul_result);
}

/// Screen blend mode
///
/// Result = 1 - (1 - Base) × (1 - Blend)
/// Light colors lighten, black is transparent
#[inline]
pub fn blend_screen(dst: &mut [f32; 4], src: [f32; 4]) {
    let dst_straight = from_premultiplied(*dst);
    let src_straight = from_premultiplied(src);

    let result = [
        1.0 - (1.0 - dst_straight[0]) * (1.0 - src_straight[0]),
        1.0 - (1.0 - dst_straight[1]) * (1.0 - src_straight[1]),
        1.0 - (1.0 - dst_straight[2]) * (1.0 - src_straight[2]),
        dst_straight[3],
    ];

    let premul_result = to_premultiplied([
        result[0],
        result[1],
        result[2],
        src_straight[3],
    ]);

    blend_premultiplied(dst, premul_result);
}

/// Overlay blend mode
///
/// Combines Multiply and Screen:
/// - If base < 0.5: 2 × Base × Blend
/// - If base >= 0.5: 1 - 2 × (1 - Base) × (1 - Blend)
#[inline]
pub fn blend_overlay(dst: &mut [f32; 4], src: [f32; 4]) {
    let dst_straight = from_premultiplied(*dst);
    let src_straight = from_premultiplied(src);

    fn overlay_channel(base: f32, blend: f32) -> f32 {
        if base < 0.5 {
            2.0 * base * blend
        } else {
            1.0 - 2.0 * (1.0 - base) * (1.0 - blend)
        }
    }

    let result = [
        overlay_channel(dst_straight[0], src_straight[0]),
        overlay_channel(dst_straight[1], src_straight[1]),
        overlay_channel(dst_straight[2], src_straight[2]),
        dst_straight[3],
    ];

    let premul_result = to_premultiplied([
        result[0],
        result[1],
        result[2],
        src_straight[3],
    ]);

    blend_premultiplied(dst, premul_result);
}

/// Apply blend with specified mode
pub fn blend(dst: &mut [f32; 4], src: [f32; 4], mode: BlendMode) {
    match mode {
        BlendMode::Normal => blend_premultiplied(dst, src),
        BlendMode::Multiply => blend_multiply(dst, src),
        BlendMode::Screen => blend_screen(dst, src),
        BlendMode::Overlay => blend_overlay(dst, src),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_premultiplied() {
        let straight = [1.0, 0.5, 0.0, 0.5];
        let premul = to_premultiplied(straight);

        assert!((premul[0] - 0.5).abs() < 0.001);
        assert!((premul[1] - 0.25).abs() < 0.001);
        assert!((premul[2] - 0.0).abs() < 0.001);
        assert!((premul[3] - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_from_premultiplied() {
        let premul = [0.5, 0.25, 0.0, 0.5];
        let straight = from_premultiplied(premul);

        assert!((straight[0] - 1.0).abs() < 0.001);
        assert!((straight[1] - 0.5).abs() < 0.001);
        assert!((straight[2] - 0.0).abs() < 0.001);
        assert!((straight[3] - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_blend_premultiplied_opaque() {
        let mut dst = [1.0, 1.0, 1.0, 1.0]; // White
        let src = [1.0, 0.0, 0.0, 1.0]; // Red, opaque

        blend_premultiplied(&mut dst, src);

        // Opaque red should completely cover white
        assert!((dst[0] - 1.0).abs() < 0.001);
        assert!((dst[1] - 0.0).abs() < 0.001);
        assert!((dst[2] - 0.0).abs() < 0.001);
        assert!((dst[3] - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_blend_premultiplied_transparent() {
        let mut dst = [1.0, 1.0, 1.0, 1.0]; // White
        let src = [0.0, 0.0, 0.0, 0.0]; // Transparent

        blend_premultiplied(&mut dst, src);

        // Transparent should not affect destination
        assert!((dst[0] - 1.0).abs() < 0.001);
        assert!((dst[1] - 1.0).abs() < 0.001);
        assert!((dst[2] - 1.0).abs() < 0.001);
        assert!((dst[3] - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_blend_premultiplied_semi_transparent() {
        let mut dst = [1.0, 1.0, 1.0, 1.0]; // White
        let src = to_premultiplied([1.0, 0.0, 0.0, 0.5]); // 50% red

        blend_premultiplied(&mut dst, src);

        // Should be pinkish (red + white * 0.5)
        assert!((dst[0] - 1.0).abs() < 0.001); // Red channel stays 1.0
        assert!((dst[1] - 0.5).abs() < 0.001); // Green reduced to 0.5
        assert!((dst[2] - 0.5).abs() < 0.001); // Blue reduced to 0.5
    }
}
