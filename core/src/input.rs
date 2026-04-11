use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Raw input point from pointer events
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct RawPoint {
    pub x: f32,
    pub y: f32,
    pub pressure: f32,
    pub tilt_x: f32,
    pub tilt_y: f32,
    pub timestamp: f64,
}

#[wasm_bindgen]
impl RawPoint {
    #[wasm_bindgen(constructor)]
    pub fn new(x: f32, y: f32, pressure: f32, tilt_x: f32, tilt_y: f32, timestamp: f64) -> Self {
        Self {
            x,
            y,
            pressure,
            tilt_x,
            tilt_y,
            timestamp,
        }
    }
}

/// Smoothed point after processing
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, Default)]
pub struct SmoothPoint {
    pub x: f32,
    pub y: f32,
    pub pressure: f32,
    pub tilt_x: f32,
    pub tilt_y: f32,
}

#[wasm_bindgen]
impl SmoothPoint {
    #[wasm_bindgen(constructor)]
    pub fn new(x: f32, y: f32, pressure: f32) -> Self {
        Self {
            x,
            y,
            pressure,
            tilt_x: 0.0,
            tilt_y: 0.0,
        }
    }

    pub fn from_raw(raw: &RawPoint) -> Self {
        Self {
            x: raw.x,
            y: raw.y,
            pressure: raw.pressure,
            tilt_x: raw.tilt_x,
            tilt_y: raw.tilt_y,
        }
    }
}

impl From<RawPoint> for SmoothPoint {
    fn from(raw: RawPoint) -> Self {
        Self::from_raw(&raw)
    }
}
