use crate::input::{RawPoint, SmoothPoint};
use wasm_bindgen::prelude::*;

/// Maximum number of EMA stages supported
const MAX_STAGES: usize = 20;

/// Multi-stage Low Pass Filter using Exponential Moving Average (EMA)
///
/// Implements the SAI-style smoothing algorithm:
/// P_out = P_prev + (P_in - P_prev) × α
///
/// Applied k times (stages) for increased smoothing.
/// Higher alpha = more responsive but less smooth
/// More stages = smoother but more latency
#[wasm_bindgen]
pub struct StrokeSmoother {
    /// Smoothing coefficient (0.0 - 1.0)
    /// Lower values = smoother, higher = more responsive
    alpha: f32,

    /// Number of EMA passes (1 - MAX_STAGES)
    stages: u8,

    /// State for each stage
    state: [SmoothPoint; MAX_STAGES],

    /// Whether the smoother has been initialized with a point
    initialized: bool,
}

#[wasm_bindgen]
impl StrokeSmoother {
    /// Create a new stroke smoother
    ///
    /// # Arguments
    /// * `alpha` - Smoothing coefficient (0.1 - 0.9 recommended, default: 0.4)
    /// * `stages` - Number of EMA passes (1 - 20, default: 3)
    #[wasm_bindgen(constructor)]
    pub fn new(alpha: f32, stages: u8) -> Self {
        let alpha = alpha.clamp(0.01, 1.0);
        let stages = stages.clamp(1, MAX_STAGES as u8);

        Self {
            alpha,
            stages,
            state: [SmoothPoint::default(); MAX_STAGES],
            initialized: false,
        }
    }

    /// Create a smoother with SAI-like settings
    pub fn sai_like() -> Self {
        // SAI uses approximately α=0.4, stages=3 for a good balance
        Self::new(0.4, 3)
    }

    /// Process an input point and return smoothed result
    #[wasm_bindgen]
    pub fn process(&mut self, input: &RawPoint) -> SmoothPoint {
        let mut current = SmoothPoint::from_raw(input);

        if !self.initialized {
            // Initialize all stages with the first point
            for i in 0..self.stages as usize {
                self.state[i] = current;
            }
            self.initialized = true;
            return current;
        }

        // Apply EMA for each stage
        for i in 0..self.stages as usize {
            let prev = &self.state[i];

            current.x = prev.x + (current.x - prev.x) * self.alpha;
            current.y = prev.y + (current.y - prev.y) * self.alpha;
            current.pressure = prev.pressure + (current.pressure - prev.pressure) * self.alpha;
            current.tilt_x = prev.tilt_x + (current.tilt_x - prev.tilt_x) * self.alpha;
            current.tilt_y = prev.tilt_y + (current.tilt_y - prev.tilt_y) * self.alpha;

            self.state[i] = current;
        }

        current
    }

    /// Reset the smoother state (call when stroke ends)
    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.initialized = false;
        self.state = [SmoothPoint::default(); MAX_STAGES];
    }

    /// Set smoothing alpha (0.01 - 1.0)
    #[wasm_bindgen]
    pub fn set_alpha(&mut self, alpha: f32) {
        self.alpha = alpha.clamp(0.01, 1.0);
    }

    /// Set number of stages (1 - 20)
    #[wasm_bindgen]
    pub fn set_stages(&mut self, stages: u8) {
        self.stages = stages.clamp(1, MAX_STAGES as u8);
    }

    /// Get current alpha value
    #[wasm_bindgen]
    pub fn get_alpha(&self) -> f32 {
        self.alpha
    }

    /// Get current stages value
    #[wasm_bindgen]
    pub fn get_stages(&self) -> u8 {
        self.stages
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_smoother_initialization() {
        let mut smoother = StrokeSmoother::new(0.5, 3);

        let point = RawPoint::new(100.0, 100.0, 0.5, 0.0, 0.0, 0.0);
        let result = smoother.process(&point);

        // First point should pass through unchanged
        assert_eq!(result.x, 100.0);
        assert_eq!(result.y, 100.0);
    }

    #[test]
    fn test_smoother_smoothing() {
        let mut smoother = StrokeSmoother::new(0.5, 1);

        // Initialize
        let p1 = RawPoint::new(0.0, 0.0, 0.5, 0.0, 0.0, 0.0);
        smoother.process(&p1);

        // Second point should be smoothed
        let p2 = RawPoint::new(100.0, 100.0, 0.5, 0.0, 0.0, 0.0);
        let result = smoother.process(&p2);

        // With α=0.5, result should be midpoint
        assert!((result.x - 50.0).abs() < 0.001);
        assert!((result.y - 50.0).abs() < 0.001);
    }

    #[test]
    fn test_smoother_reset() {
        let mut smoother = StrokeSmoother::new(0.5, 3);

        let p1 = RawPoint::new(100.0, 100.0, 0.5, 0.0, 0.0, 0.0);
        smoother.process(&p1);

        smoother.reset();

        // After reset, next point should pass through unchanged
        let p2 = RawPoint::new(200.0, 200.0, 0.5, 0.0, 0.0, 0.0);
        let result = smoother.process(&p2);

        assert_eq!(result.x, 200.0);
        assert_eq!(result.y, 200.0);
    }
}

#[cfg(test)]
mod benches {
    extern crate test;
    use test::Bencher;
    use super::*;
    use crate::input::RawPoint;

    fn make_raw(x: f32, y: f32) -> RawPoint {
        RawPoint::new(x, y, 0.8, 0.0, 0.0, 0.0)
    }

    #[bench]
    fn bench_smoother_single_stage_1(b: &mut Bencher) {
        let mut smoother = StrokeSmoother::new(0.4, 1);
        let pt = make_raw(100.0, 100.0);
        smoother.process(&pt); // 初期化ウォームアップ
        b.iter(|| {
            test::black_box(smoother.process(test::black_box(&pt)));
        });
    }

    #[bench]
    fn bench_smoother_sai_3_stages(b: &mut Bencher) {
        let mut smoother = StrokeSmoother::sai_like();
        let pt = make_raw(100.0, 100.0);
        smoother.process(&pt);
        b.iter(|| {
            test::black_box(smoother.process(test::black_box(&pt)));
        });
    }

    #[bench]
    fn bench_smoother_max_20_stages(b: &mut Bencher) {
        let mut smoother = StrokeSmoother::new(0.4, 20);
        let pt = make_raw(100.0, 100.0);
        smoother.process(&pt);
        b.iter(|| {
            test::black_box(smoother.process(test::black_box(&pt)));
        });
    }

    #[bench]
    fn bench_smoother_stroke_100pts_sai(b: &mut Bencher) {
        let points: Vec<RawPoint> = (0..100)
            .map(|i| make_raw(i as f32 * 5.0, (i as f32 * 0.1_f32).sin() * 20.0))
            .collect();
        b.iter(|| {
            let mut smoother = StrokeSmoother::sai_like();
            for pt in &points {
                test::black_box(smoother.process(test::black_box(pt)));
            }
        });
    }
}
