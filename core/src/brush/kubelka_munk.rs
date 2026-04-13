use wasm_bindgen::prelude::*;

/// Minimum reflectance floor. Real pigments always have some scattering in
/// every channel, so zero-reflectance doesn't occur in practice. This floor
/// prevents extreme K/S values that would dominate the mixing arithmetic.
///
/// NOTE: Even with this floor, mixing RGB-complement pairs (e.g. pure blue
/// #0000FF + pure yellow #FFFF00) will still produce dark neutral tones
/// because the simplified 3-channel K-M model lacks spectral resolution.
/// Real blue pigments reflect some green light, which can only be captured
/// with spectral upsampling (7+ bands). This is a known PoC limitation.
const MIN_REFLECTANCE: f32 = 0.005;

/// Convert a single reflectance channel [0..1] to a Kubelka-Munk K/S ratio.
///
/// Formula: K/S = (1 - R)² / (2R)
/// R is clamped to [MIN_REFLECTANCE, 1.0] to avoid extreme K/S values.
#[inline]
fn reflectance_to_ks(r: f32) -> f32 {
    let r_clamped = r.clamp(MIN_REFLECTANCE, 1.0);
    let one_minus_r = 1.0 - r_clamped;
    (one_minus_r * one_minus_r) / (2.0 * r_clamped)
}

/// Convert a K/S ratio back to reflectance.
///
/// Derived by solving K/S = (1-R)²/(2R) for R via the quadratic formula:
///   R = 1 + K/S - sqrt((K/S)² + 2·K/S)
/// The negative root is chosen so that R ∈ [0, 1].
#[inline]
fn ks_to_reflectance(ks: f32) -> f32 {
    if ks < MIN_REFLECTANCE {
        return 1.0; // K/S ≈ 0 means no absorption → full reflectance
    }
    let r = 1.0 + ks - (ks * ks + 2.0 * ks).sqrt();
    r.clamp(0.0, 1.0)
}

/// Convert straight RGB [0..1] to K/S triplet.
#[inline]
pub fn rgb_to_ks(rgb: [f32; 3]) -> [f32; 3] {
    [
        reflectance_to_ks(rgb[0]),
        reflectance_to_ks(rgb[1]),
        reflectance_to_ks(rgb[2]),
    ]
}

/// Convert K/S triplet back to straight RGB.
#[inline]
pub fn ks_to_rgb(ks: [f32; 3]) -> [f32; 3] {
    [
        ks_to_reflectance(ks[0]),
        ks_to_reflectance(ks[1]),
        ks_to_reflectance(ks[2]),
    ]
}

/// Mix two colors using simplified Kubelka-Munk theory.
///
/// Performs a weighted average in K/S (absorption/scattering) space rather
/// than in RGB space.  This produces physically plausible subtractive color
/// mixing — e.g. blue + yellow → green instead of gray.
///
/// # Parameters
/// - `a_r, a_g, a_b, a_a` — Color A in straight RGBA [0..1]
/// - `b_r, b_g, b_b, b_a` — Color B in straight RGBA [0..1]
/// - `mix_ratio` — 0.0 = pure A, 1.0 = pure B
///
/// # Returns
/// Mixed color as `Vec<f32>` of length 4 (straight RGBA).
/// Alpha is linearly interpolated independently of the K/S mixing.
#[wasm_bindgen]
pub fn km_mix_colors(
    a_r: f32,
    a_g: f32,
    a_b: f32,
    a_a: f32,
    b_r: f32,
    b_g: f32,
    b_b: f32,
    b_a: f32,
    mix_ratio: f32,
) -> Vec<f32> {
    let ratio = mix_ratio.clamp(0.0, 1.0);
    let inv = 1.0 - ratio;

    let ks_a = rgb_to_ks([a_r, a_g, a_b]);
    let ks_b = rgb_to_ks([b_r, b_g, b_b]);

    // Weighted average in K/S space
    let mixed_ks = [
        ks_a[0] * inv + ks_b[0] * ratio,
        ks_a[1] * inv + ks_b[1] * ratio,
        ks_a[2] * inv + ks_b[2] * ratio,
    ];

    let rgb = ks_to_rgb(mixed_ks);
    let alpha = a_a * inv + b_a * ratio;

    vec![rgb[0], rgb[1], rgb[2], alpha]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reflectance_roundtrip() {
        for &r in &[0.1_f32, 0.5, 0.9] {
            let ks = reflectance_to_ks(r);
            let back = ks_to_reflectance(ks);
            assert!(
                (back - r).abs() < 0.001,
                "roundtrip failed for r={}: got {}",
                r,
                back
            );
        }
    }

    #[test]
    fn test_blue_yellow_makes_green() {
        // Subtractive mixing hallmark: blue + yellow → green-dominant.
        // We use realistic pigment reflectance values (not pure spectral primaries)
        // because the 3-channel K-M model requires nonzero reflectance in all
        // channels to avoid the complementary-pair degeneration to black.
        let result = km_mix_colors(
            0.15, 0.20, 0.85, 1.0, // blue pigment (some green reflectance)
            0.95, 0.90, 0.15, 1.0, // yellow pigment (some blue reflectance)
            0.5,
        );
        // Green channel should be the highest
        assert!(
            result[1] > result[0] && result[1] > result[2],
            "expected green-dominant, got R={:.3} G={:.3} B={:.3}",
            result[0],
            result[1],
            result[2]
        );
    }

    #[test]
    fn test_ratio_zero_returns_a() {
        let result = km_mix_colors(
            0.8, 0.2, 0.5, 0.9, // color A
            0.1, 0.9, 0.3, 0.4, // color B
            0.0,                  // all A
        );
        assert!((result[0] - 0.8).abs() < 0.001);
        assert!((result[1] - 0.2).abs() < 0.001);
        assert!((result[2] - 0.5).abs() < 0.001);
        assert!((result[3] - 0.9).abs() < 0.001);
    }

    #[test]
    fn test_ratio_one_returns_b() {
        let result = km_mix_colors(
            0.8, 0.2, 0.5, 0.9, // color A
            0.1, 0.9, 0.3, 0.4, // color B
            1.0,                  // all B
        );
        assert!((result[0] - 0.1).abs() < 0.001);
        assert!((result[1] - 0.9).abs() < 0.001);
        assert!((result[2] - 0.3).abs() < 0.001);
        assert!((result[3] - 0.4).abs() < 0.001);
    }

    #[test]
    fn test_white_plus_white() {
        let result = km_mix_colors(
            1.0, 1.0, 1.0, 1.0, // white
            1.0, 1.0, 1.0, 1.0, // white
            0.5,
        );
        assert!((result[0] - 1.0).abs() < 0.001);
        assert!((result[1] - 1.0).abs() < 0.001);
        assert!((result[2] - 1.0).abs() < 0.001);
        assert!((result[3] - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_black_no_nan() {
        let result = km_mix_colors(
            0.0, 0.0, 0.0, 1.0, // black
            0.0, 0.0, 0.0, 1.0, // black
            0.5,
        );
        for (i, &v) in result.iter().enumerate() {
            assert!(!v.is_nan(), "channel {} is NaN", i);
            assert!(!v.is_infinite(), "channel {} is infinite", i);
        }
        // Should be very dark (near 0)
        assert!(result[0] < 0.01);
        assert!(result[1] < 0.01);
        assert!(result[2] < 0.01);
    }

    #[test]
    fn test_alpha_interpolation() {
        let result = km_mix_colors(
            0.5, 0.5, 0.5, 0.2, // alpha 0.2
            0.5, 0.5, 0.5, 0.8, // alpha 0.8
            0.5,
        );
        assert!(
            (result[3] - 0.5).abs() < 0.001,
            "expected alpha ≈ 0.5, got {}",
            result[3]
        );
    }
}
