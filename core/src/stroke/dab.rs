use crate::input::SmoothPoint;
use wasm_bindgen::prelude::*;

/// A single brush stamp (dab) to be rendered
#[wasm_bindgen]
#[derive(Clone, Copy, Debug)]
pub struct Dab {
    pub x: f32,
    pub y: f32,
    pub pressure: f32,
    pub size: f32,
}

#[wasm_bindgen]
impl Dab {
    #[wasm_bindgen(constructor)]
    pub fn new(x: f32, y: f32, pressure: f32, size: f32) -> Self {
        Self { x, y, pressure, size }
    }
}

/// Generates dabs (brush stamps) along a stroke path
///
/// Places dabs at regular intervals based on brush size and spacing ratio.
/// This creates a smooth, continuous stroke appearance.
#[wasm_bindgen]
pub struct DabGenerator {
    /// Spacing as percentage of brush size (e.g., 0.25 = 25%)
    spacing_ratio: f32,

    /// Accumulated distance since last dab
    accumulated_distance: f32,

    /// Last processed point
    last_point: Option<SmoothPoint>,

    /// Base brush size
    brush_size: f32,
}

#[wasm_bindgen]
impl DabGenerator {
    #[wasm_bindgen(constructor)]
    pub fn new(brush_size: f32, spacing_ratio: f32) -> Self {
        Self {
            spacing_ratio: spacing_ratio.clamp(0.01, 1.0),
            accumulated_distance: 0.0,
            last_point: None,
            brush_size,
        }
    }

    /// Reset the generator (call at stroke start)
    pub fn reset(&mut self) {
        self.accumulated_distance = 0.0;
        self.last_point = None;
    }

    /// Set brush size
    pub fn set_brush_size(&mut self, size: f32) {
        self.brush_size = size.max(1.0);
    }

    /// Set spacing ratio
    pub fn set_spacing_ratio(&mut self, ratio: f32) {
        self.spacing_ratio = ratio.clamp(0.01, 1.0);
    }

    /// Get brush size
    pub fn get_brush_size(&self) -> f32 {
        self.brush_size
    }
}

impl DabGenerator {
    /// Generate dabs for a new point
    ///
    /// Returns a vector of dabs that should be rendered between
    /// the last point and the current point.
    pub fn generate(&mut self, point: SmoothPoint) -> Vec<Dab> {
        let mut dabs = Vec::new();

        // Calculate effective brush size with pressure
        let effective_size = self.brush_size * point.pressure.max(0.1);
        let spacing = effective_size * self.spacing_ratio;

        if let Some(last) = self.last_point {
            let dx = point.x - last.x;
            let dy = point.y - last.y;
            let distance = (dx * dx + dy * dy).sqrt();

            if distance > 0.001 {
                self.accumulated_distance += distance;

                // Generate dabs at regular intervals
                while self.accumulated_distance >= spacing {
                    // Calculate interpolation factor
                    let overshoot = self.accumulated_distance - spacing;
                    let t = 1.0 - (overshoot / distance).min(1.0);

                    // Interpolate position
                    let dab_x = last.x + dx * t;
                    let dab_y = last.y + dy * t;

                    // Interpolate pressure
                    let dab_pressure = last.pressure + (point.pressure - last.pressure) * t;

                    dabs.push(Dab {
                        x: dab_x,
                        y: dab_y,
                        pressure: dab_pressure,
                        size: self.brush_size * dab_pressure.max(0.1),
                    });

                    self.accumulated_distance -= spacing;
                }
            }
        } else {
            // First point: generate a single dab
            dabs.push(Dab {
                x: point.x,
                y: point.y,
                pressure: point.pressure,
                size: effective_size,
            });
        }

        self.last_point = Some(point);
        dabs
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_first_dab() {
        let mut gen = DabGenerator::new(10.0, 0.25);

        let point = SmoothPoint::new(100.0, 100.0, 1.0);
        let dabs = gen.generate(point);

        assert_eq!(dabs.len(), 1);
        assert_eq!(dabs[0].x, 100.0);
        assert_eq!(dabs[0].y, 100.0);
    }

    #[test]
    fn test_multiple_dabs() {
        let mut gen = DabGenerator::new(10.0, 0.25);

        // First point
        let p1 = SmoothPoint::new(0.0, 0.0, 1.0);
        gen.generate(p1);

        // Move far enough to generate multiple dabs
        // With size=10 and spacing=0.25, spacing is 2.5 pixels
        // Moving 10 pixels should generate ~4 dabs
        let p2 = SmoothPoint::new(10.0, 0.0, 1.0);
        let dabs = gen.generate(p2);

        assert!(dabs.len() >= 3);
    }

    #[test]
    fn test_reset() {
        let mut gen = DabGenerator::new(10.0, 0.25);

        let p1 = SmoothPoint::new(0.0, 0.0, 1.0);
        gen.generate(p1);

        gen.reset();

        // After reset, next point should be treated as first
        let p2 = SmoothPoint::new(100.0, 100.0, 1.0);
        let dabs = gen.generate(p2);

        assert_eq!(dabs.len(), 1);
        assert_eq!(dabs[0].x, 100.0);
    }
}
