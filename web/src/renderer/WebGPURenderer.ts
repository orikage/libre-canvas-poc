import { Renderer, BrushTextureType } from './Renderer';
import {
  TEX_SIZE,
  generateGrainData,
  DEFAULT_GRAIN_SCALE,
} from './grainTexture';

// ---------------------------------------------------------------------------
// WGSL: Brush dab shader (with grain texture)
// ---------------------------------------------------------------------------
const BRUSH_WGSL = /* wgsl */ `
struct Uniforms {
  canvas_size: vec2f,
  grain_scale: f32,   // canvas pixels per texture tile
  _pad:        f32,
}

struct DabData {
  pos:      vec2f,
  radius:   f32,
  hardness: f32,
  color:    vec4f,  // pre-multiplied alpha: (r*a, g*a, b*a, a)
}

@group(0) @binding(0) var<uniform>          uniforms: Uniforms;
@group(0) @binding(1) var<storage, read>    dabs:     array<DabData>;
@group(0) @binding(2) var                   t_grain:  texture_2d<f32>;
@group(0) @binding(3) var                   s_grain:  sampler;

struct VertexOut {
  @builtin(position) clip_pos:  vec4f,
  @location(0)       local_pos: vec2f,   // [-1, 1] within the quad
  @location(1)       hardness:  f32,
  @location(2)       color:     vec4f,
  @location(3)       world_pos: vec2f,   // canvas-space position
}

// Unit quad corners in local space (triangle-strip order)
fn quad_local(vi: u32) -> vec2f {
  let x = f32((vi & 2u) >> 1u) * 2.0 - 1.0;
  let y = f32(vi & 1u) * 2.0 - 1.0;
  return vec2f(x, y);
}

@vertex
fn vs_main(
  @builtin(vertex_index)   vi:  u32,
  @builtin(instance_index) idx: u32,
) -> VertexOut {
  let dab       = dabs[idx];
  let local     = quad_local(vi);
  let world_pos = dab.pos + local * dab.radius;

  let W   = uniforms.canvas_size.x;
  let H   = uniforms.canvas_size.y;
  let ndc = vec2f(
     world_pos.x / W * 2.0 - 1.0,
    -(world_pos.y / H * 2.0 - 1.0),
  );

  var out: VertexOut;
  out.clip_pos  = vec4f(ndc, 0.0, 1.0);
  out.local_pos = local;
  out.hardness  = dab.hardness;
  out.color     = dab.color;
  out.world_pos = world_pos;
  return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let dist = length(in.local_pos);
  if dist > 1.0 { discard; }

  // Brush shape: feathered circle
  let shape_alpha = smoothstep(1.0, in.hardness, dist);

  // Grain texture: sampled in canvas space (texture anchored to canvas, not brush)
  let grain_uv = fract(in.world_pos / uniforms.grain_scale);
  let grain    = textureSample(t_grain, s_grain, grain_uv).r;

  let alpha = shape_alpha * grain;
  return vec4f(in.color.rgb * alpha, in.color.a * alpha);
}
`;

// ---------------------------------------------------------------------------
// WGSL: Full-screen blit shader (drawingTexture -> canvas swap-chain)
// ---------------------------------------------------------------------------
const BLIT_WGSL = /* wgsl */ `
@group(0) @binding(0) var t_drawing: texture_2d<f32>;
@group(0) @binding(1) var s_drawing: sampler;

struct VertexOut {
  @builtin(position) pos: vec4f,
  @location(0)       uv:  vec2f,
}

// Full-screen triangle: vi=0->(-1,-1), vi=1->(3,-1), vi=2->(-1,3)
@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOut {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );
  let ndc = positions[vi];
  // UV: NDC Y-up -> texture Y-down
  let uv = vec2f((ndc.x + 1.0) * 0.5, (1.0 - ndc.y) * 0.5);

  var out: VertexOut;
  out.pos = vec4f(ndc, 0.0, 1.0);
  out.uv  = uv;
  return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  return textureSample(t_drawing, s_drawing, in.uv);
}
`;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_DABS         = 4096;
const DAB_FLOATS       = 8;
const DAB_STRIDE_BYTES = DAB_FLOATS * 4;

// ---------------------------------------------------------------------------
// WebGPURenderer
// ---------------------------------------------------------------------------
export class WebGPURenderer implements Renderer {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private canvasFormat: GPUTextureFormat;

  private drawingTexture:     GPUTexture;
  private drawingTextureView: GPUTextureView;

  private uniformBuffer: GPUBuffer;
  private dabBuffer:     GPUBuffer;

  private grainTexture: GPUTexture;
  private grainSampler: GPUSampler;
  private grainScale:   number;

  private brushPipeline:  GPURenderPipeline;
  private brushBindGroup: GPUBindGroup;

  private blitPipeline:  GPURenderPipeline;
  private blitBindGroup: GPUBindGroup;
  private blitSampler:   GPUSampler;

  private shadowCanvas: HTMLCanvasElement;
  private shadowCtx:    CanvasRenderingContext2D;

  private width:  number;
  private height: number;

  // Private constructor — use WebGPURenderer.create()
  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    canvasFormat: GPUTextureFormat,
    drawingTexture: GPUTexture,
    uniformBuffer: GPUBuffer,
    dabBuffer: GPUBuffer,
    grainTexture: GPUTexture,
    grainSampler: GPUSampler,
    grainScale: number,
    brushPipeline: GPURenderPipeline,
    brushBindGroup: GPUBindGroup,
    blitPipeline: GPURenderPipeline,
    blitBindGroup: GPUBindGroup,
    blitSampler: GPUSampler,
    shadowCanvas: HTMLCanvasElement,
    shadowCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) {
    this.device          = device;
    this.context         = context;
    this.canvasFormat    = canvasFormat;
    this.drawingTexture  = drawingTexture;
    this.drawingTextureView = drawingTexture.createView();
    this.uniformBuffer   = uniformBuffer;
    this.dabBuffer       = dabBuffer;
    this.grainTexture    = grainTexture;
    this.grainSampler    = grainSampler;
    this.grainScale      = grainScale;
    this.brushPipeline   = brushPipeline;
    this.brushBindGroup  = brushBindGroup;
    this.blitPipeline    = blitPipeline;
    this.blitBindGroup   = blitBindGroup;
    this.blitSampler     = blitSampler;
    this.shadowCanvas    = shadowCanvas;
    this.shadowCtx       = shadowCtx;
    this.width           = width;
    this.height          = height;
  }

  // -------------------------------------------------------------------------
  // Static factory
  // -------------------------------------------------------------------------
  static async create(canvas: HTMLCanvasElement): Promise<WebGPURenderer | null> {
    if (!('gpu' in navigator)) return null;

    let adapter: GPUAdapter | null = null;
    let device:  GPUDevice  | null = null;
    try {
      adapter = await (navigator as unknown as { gpu: GPU }).gpu.requestAdapter();
      if (!adapter) return null;
      device = await adapter.requestDevice();
    } catch { return null; }

    const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!context) return null;

    const canvasFormat = (navigator as unknown as { gpu: GPU }).gpu.getPreferredCanvasFormat();
    context.configure({ device, format: canvasFormat, alphaMode: 'premultiplied' });

    const width  = canvas.width;
    const height = canvas.height;

    // Uniform buffer: canvas_size (vec2f) + grain_scale (f32) + pad (f32) = 16 bytes
    const uniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Dab storage buffer
    const dabBuffer = device.createBuffer({
      size: MAX_DABS * DAB_STRIDE_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Default grain texture: 'round' (solid white)
    const initGrainType: BrushTextureType = 'round';
    const grainScale = DEFAULT_GRAIN_SCALE[initGrainType];
    const grainTexture = WebGPURenderer._uploadGrainTexture(device, initGrainType);
    const grainSampler = device.createSampler({
      magFilter:    'linear',
      minFilter:    'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    });

    // Write initial uniforms
    device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([width, height, grainScale, 0]));

    // Drawing texture
    const drawingTexture = WebGPURenderer._createDrawingTexture(device, width, height);
    WebGPURenderer._clearTextureWhite(device, drawingTexture);

    // Pipelines
    const brushPipeline = WebGPURenderer._createBrushPipeline(device);
    const blitPipeline  = WebGPURenderer._createBlitPipeline(device, canvasFormat);
    const blitSampler   = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    const drawingTextureView = drawingTexture.createView();

    const brushBindGroup = WebGPURenderer._createBrushBindGroup(
      device, brushPipeline, uniformBuffer, dabBuffer,
      grainTexture.createView(), grainSampler,
    );
    const blitBindGroup = WebGPURenderer._createBlitBindGroup(
      device, blitPipeline, drawingTextureView, blitSampler,
    );

    // Shadow canvas
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width  = width;
    shadowCanvas.height = height;
    const shadowCtx = shadowCanvas.getContext('2d', { alpha: false });
    if (!shadowCtx) return null;
    shadowCtx.fillStyle = 'white';
    shadowCtx.fillRect(0, 0, width, height);

    return new WebGPURenderer(
      device, context, canvasFormat,
      drawingTexture, uniformBuffer, dabBuffer,
      grainTexture, grainSampler, grainScale,
      brushPipeline, brushBindGroup,
      blitPipeline, blitBindGroup, blitSampler,
      shadowCanvas, shadowCtx,
      width, height,
    );
  }

  // -------------------------------------------------------------------------
  // Private static helpers
  // -------------------------------------------------------------------------

  private static _uploadGrainTexture(device: GPUDevice, type: BrushTextureType): GPUTexture {
    const data    = generateGrainData(type);
    const texture = device.createTexture({
      size:   { width: TEX_SIZE, height: TEX_SIZE },
      format: 'rgba8unorm',
      usage:  GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture },
      data,
      { bytesPerRow: TEX_SIZE * 4, rowsPerImage: TEX_SIZE },
      { width: TEX_SIZE, height: TEX_SIZE },
    );
    return texture;
  }

  private static _createDrawingTexture(device: GPUDevice, width: number, height: number): GPUTexture {
    return device.createTexture({
      size:   { width, height },
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING   |
        GPUTextureUsage.COPY_SRC          |
        GPUTextureUsage.COPY_DST,
    });
  }

  private static _clearTextureWhite(device: GPUDevice, texture: GPUTexture): void {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view:       texture.createView(),
        clearValue: { r: 1, g: 1, b: 1, a: 1 },
        loadOp:     'clear',
        storeOp:    'store',
      }],
    });
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  private static _createBrushPipeline(device: GPUDevice): GPURenderPipeline {
    const module = device.createShaderModule({ code: BRUSH_WGSL });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' } },
      ],
    });

    return device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex:   { module, entryPoint: 'vs_main' },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [{
          format: 'rgba8unorm',
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-strip' },
    });
  }

  private static _createBlitPipeline(device: GPUDevice, canvasFormat: GPUTextureFormat): GPURenderPipeline {
    const module = device.createShaderModule({ code: BLIT_WGSL });
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    return device.createRenderPipeline({
      layout:   device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex:   { module, entryPoint: 'vs_main' },
      fragment: { module, entryPoint: 'fs_main', targets: [{ format: canvasFormat }] },
      primitive: { topology: 'triangle-list' },
    });
  }

  private static _createBrushBindGroup(
    device: GPUDevice, pipeline: GPURenderPipeline,
    uniformBuffer: GPUBuffer, dabBuffer: GPUBuffer,
    grainView: GPUTextureView, grainSampler: GPUSampler,
  ): GPUBindGroup {
    return device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: dabBuffer } },
        { binding: 2, resource: grainView },
        { binding: 3, resource: grainSampler },
      ],
    });
  }

  private static _createBlitBindGroup(
    device: GPUDevice, pipeline: GPURenderPipeline,
    textureView: GPUTextureView, sampler: GPUSampler,
  ): GPUBindGroup {
    return device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: textureView },
        { binding: 1, resource: sampler },
      ],
    });
  }

  // -------------------------------------------------------------------------
  // Renderer interface
  // -------------------------------------------------------------------------

  getType(): 'canvas2d' | 'webgpu' { return 'webgpu'; }

  setBrushTexture(type: BrushTextureType, grainScale?: number): void {
    this.grainTexture.destroy();
    this.grainTexture = WebGPURenderer._uploadGrainTexture(this.device, type);
    this.grainScale   = grainScale ?? DEFAULT_GRAIN_SCALE[type];

    // Update grain_scale in uniform buffer
    this.device.queue.writeBuffer(
      this.uniformBuffer, 0,
      new Float32Array([this.width, this.height, this.grainScale, 0]),
    );

    // Recreate brush bind group (new texture view)
    this.brushBindGroup = WebGPURenderer._createBrushBindGroup(
      this.device, this.brushPipeline,
      this.uniformBuffer, this.dabBuffer,
      this.grainTexture.createView(), this.grainSampler,
    );
  }

  clear(): void {
    WebGPURenderer._clearTextureWhite(this.device, this.drawingTexture);
    this.shadowCtx.fillStyle = 'white';
    this.shadowCtx.fillRect(0, 0, this.width, this.height);
    this.present();
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, size: number, color: number[]): void {
    const dx = x2 - x1, dy = y2 - y1;
    const dist    = Math.sqrt(dx*dx + dy*dy);
    const spacing = Math.max(size * 0.25, 1);
    const steps   = Math.max(Math.floor(dist / spacing), 1);

    const [r, g, b, a] = [color[0]??0, color[1]??0, color[2]??0, color[3]??1];
    const radius = size * 0.5;
    const hardness = 0.7;
    const [pr, pg, pb] = [r*a, g*a, b*a];

    const dabs = new Float32Array(steps * DAB_FLOATS);
    for (let i = 0; i < steps; i++) {
      const t = steps === 1 ? 0 : i / (steps - 1);
      const ox = i * DAB_FLOATS;
      dabs[ox+0] = x1 + dx*t;
      dabs[ox+1] = y1 + dy*t;
      dabs[ox+2] = radius;
      dabs[ox+3] = hardness;
      dabs[ox+4] = pr; dabs[ox+5] = pg; dabs[ox+6] = pb; dabs[ox+7] = a;
    }
    this._drawDabs(dabs, steps);

    const ctx = this.shadowCtx;
    ctx.strokeStyle = `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${a})`;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  drawCircle(x: number, y: number, radius: number, color: number[]): void {
    const [r, g, b, a] = [color[0]??0, color[1]??0, color[2]??0, color[3]??1];
    const dab = new Float32Array([x, y, radius, 0.7, r*a, g*a, b*a, a]);
    this._drawDabs(dab, 1);

    const ctx = this.shadowCtx;
    ctx.fillStyle = `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${a})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  present(): void {
    const encoder   = this.device.createCommandEncoder();
    const canvasView = this.context.getCurrentTexture().createView();
    const blitPass  = encoder.beginRenderPass({
      colorAttachments: [{
        view: canvasView,
        clearValue: { r: 1, g: 1, b: 1, a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }],
    });
    blitPass.setPipeline(this.blitPipeline);
    blitPass.setBindGroup(0, this.blitBindGroup);
    blitPass.draw(3);
    blitPass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  resize(width: number, height: number): void {
    const oldData = this.shadowCtx.getImageData(0, 0, this.width, this.height);

    this.shadowCanvas.width  = width;
    this.shadowCanvas.height = height;
    this.shadowCtx.fillStyle = 'white';
    this.shadowCtx.fillRect(0, 0, width, height);
    this.shadowCtx.putImageData(oldData, 0, 0);

    this.drawingTexture.destroy();
    this.drawingTexture = WebGPURenderer._createDrawingTexture(this.device, width, height);
    WebGPURenderer._clearTextureWhite(this.device, this.drawingTexture);

    const newData = this.shadowCtx.getImageData(0, 0, width, height);
    this._uploadImageDataToTexture(newData);

    this.drawingTextureView = this.drawingTexture.createView();
    this.blitBindGroup = WebGPURenderer._createBlitBindGroup(
      this.device, this.blitPipeline, this.drawingTextureView, this.blitSampler,
    );

    this.width  = width;
    this.height = height;
    this.device.queue.writeBuffer(
      this.uniformBuffer, 0,
      new Float32Array([width, height, this.grainScale, 0]),
    );

    this.context.configure({
      device: this.device, format: this.canvasFormat, alphaMode: 'premultiplied',
    });

    this.present();
  }

  getImageData(): ImageData {
    return this.shadowCtx.getImageData(0, 0, this.width, this.height);
  }

  putImageData(data: ImageData): void {
    this.shadowCtx.putImageData(data, 0, 0);
    this._uploadImageDataToTexture(data);
    this.present();
  }

  destroy(): void {
    this.drawingTexture.destroy();
    this.grainTexture.destroy();
    this.uniformBuffer.destroy();
    this.dabBuffer.destroy();
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private _drawDabs(dabs: Float32Array, count: number): void {
    if (count === 0) return;
    const clamped = Math.min(count, MAX_DABS);
    this.device.queue.writeBuffer(this.dabBuffer, 0, dabs, 0, clamped * DAB_FLOATS);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view:    this.drawingTextureView,
        loadOp:  'load',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.brushPipeline);
    pass.setBindGroup(0, this.brushBindGroup);
    pass.draw(4, clamped);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  private _uploadImageDataToTexture(data: ImageData): void {
    this.device.queue.writeTexture(
      { texture: this.drawingTexture },
      data.data,
      { bytesPerRow: data.width * 4, rowsPerImage: data.height },
      { width: data.width, height: data.height },
    );
  }
}
