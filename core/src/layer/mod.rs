pub mod composite;

pub use composite::{composite_layers, LayerBlendMode};
use crate::canvas::SparseCanvas;
use wasm_bindgen::prelude::*;

/// A single layer in the layer stack
#[wasm_bindgen]
pub struct Layer {
    /// Unique layer ID
    id: u32,

    /// Layer name
    name: String,

    /// Layer visibility
    visible: bool,

    /// Layer opacity (0.0 - 1.0)
    opacity: f32,

    /// Blend mode
    blend_mode: LayerBlendMode,

    /// Canvas data for this layer
    canvas: SparseCanvas,
}

#[wasm_bindgen]
impl Layer {
    #[wasm_bindgen(constructor)]
    pub fn new(id: u32, name: String, width: u32, height: u32) -> Self {
        Self {
            id,
            name,
            visible: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::Normal,
            canvas: SparseCanvas::new(width, height),
        }
    }

    pub fn id(&self) -> u32 {
        self.id
    }

    pub fn name(&self) -> String {
        self.name.clone()
    }

    pub fn set_name(&mut self, name: String) {
        self.name = name;
    }

    pub fn visible(&self) -> bool {
        self.visible
    }

    pub fn set_visible(&mut self, visible: bool) {
        self.visible = visible;
    }

    pub fn opacity(&self) -> f32 {
        self.opacity
    }

    pub fn set_opacity(&mut self, opacity: f32) {
        self.opacity = opacity.clamp(0.0, 1.0);
    }

    pub fn blend_mode(&self) -> LayerBlendMode {
        self.blend_mode
    }

    pub fn set_blend_mode(&mut self, mode: LayerBlendMode) {
        self.blend_mode = mode;
    }
}

impl Layer {
    pub fn canvas(&self) -> &SparseCanvas {
        &self.canvas
    }

    pub fn canvas_mut(&mut self) -> &mut SparseCanvas {
        &mut self.canvas
    }
}

/// Layer stack manager
#[wasm_bindgen]
pub struct LayerStack {
    layers: Vec<Layer>,
    active_layer_index: usize,
    next_id: u32,
    width: u32,
    height: u32,
}

#[wasm_bindgen]
impl LayerStack {
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32) -> Self {
        let mut stack = Self {
            layers: Vec::new(),
            active_layer_index: 0,
            next_id: 1,
            width,
            height,
        };

        // Create initial background layer
        stack.add_layer("Background".to_string());

        stack
    }

    pub fn layer_count(&self) -> usize {
        self.layers.len()
    }

    pub fn active_layer_index(&self) -> usize {
        self.active_layer_index
    }

    pub fn set_active_layer(&mut self, index: usize) {
        if index < self.layers.len() {
            self.active_layer_index = index;
        }
    }

    pub fn add_layer(&mut self, name: String) -> u32 {
        let id = self.next_id;
        self.next_id += 1;

        let layer = Layer::new(id, name, self.width, self.height);
        self.layers.push(layer);
        self.active_layer_index = self.layers.len() - 1;

        id
    }

    pub fn remove_layer(&mut self, index: usize) -> bool {
        if self.layers.len() <= 1 || index >= self.layers.len() {
            return false;
        }

        self.layers.remove(index);

        if self.active_layer_index >= self.layers.len() {
            self.active_layer_index = self.layers.len() - 1;
        }

        true
    }

    pub fn move_layer(&mut self, from: usize, to: usize) -> bool {
        if from >= self.layers.len() || to >= self.layers.len() {
            return false;
        }

        let layer = self.layers.remove(from);
        self.layers.insert(to, layer);

        // Update active layer index
        if self.active_layer_index == from {
            self.active_layer_index = to;
        } else if from < self.active_layer_index && to >= self.active_layer_index {
            self.active_layer_index -= 1;
        } else if from > self.active_layer_index && to <= self.active_layer_index {
            self.active_layer_index += 1;
        }

        true
    }

    pub fn get_layer_name(&self, index: usize) -> Option<String> {
        self.layers.get(index).map(|l| l.name())
    }

    pub fn set_layer_name(&mut self, index: usize, name: String) -> bool {
        if let Some(layer) = self.layers.get_mut(index) {
            layer.set_name(name);
            true
        } else {
            false
        }
    }

    pub fn get_layer_visible(&self, index: usize) -> bool {
        self.layers.get(index).map(|l| l.visible()).unwrap_or(false)
    }

    pub fn set_layer_visible(&mut self, index: usize, visible: bool) -> bool {
        if let Some(layer) = self.layers.get_mut(index) {
            layer.set_visible(visible);
            true
        } else {
            false
        }
    }

    pub fn get_layer_opacity(&self, index: usize) -> f32 {
        self.layers.get(index).map(|l| l.opacity()).unwrap_or(1.0)
    }

    pub fn set_layer_opacity(&mut self, index: usize, opacity: f32) -> bool {
        if let Some(layer) = self.layers.get_mut(index) {
            layer.set_opacity(opacity);
            true
        } else {
            false
        }
    }

    pub fn get_layer_blend_mode(&self, index: usize) -> LayerBlendMode {
        self.layers
            .get(index)
            .map(|l| l.blend_mode())
            .unwrap_or(LayerBlendMode::Normal)
    }

    pub fn set_layer_blend_mode(&mut self, index: usize, mode: LayerBlendMode) -> bool {
        if let Some(layer) = self.layers.get_mut(index) {
            layer.set_blend_mode(mode);
            true
        } else {
            false
        }
    }
}

impl LayerStack {
    pub fn get_layer(&self, index: usize) -> Option<&Layer> {
        self.layers.get(index)
    }

    pub fn get_layer_mut(&mut self, index: usize) -> Option<&mut Layer> {
        self.layers.get_mut(index)
    }

    pub fn active_layer(&self) -> Option<&Layer> {
        self.layers.get(self.active_layer_index)
    }

    pub fn active_layer_mut(&mut self) -> Option<&mut Layer> {
        self.layers.get_mut(self.active_layer_index)
    }

    pub fn iter(&self) -> impl Iterator<Item = &Layer> {
        self.layers.iter()
    }
}
