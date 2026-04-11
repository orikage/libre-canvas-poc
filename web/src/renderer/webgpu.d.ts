/**
 * Minimal ambient WebGPU type declarations for the renderer package.
 *
 * Only the subset of the WebGPU spec used by WebGPURenderer.ts is declared
 * here to avoid a hard dependency on @webgpu/types while still satisfying
 * TypeScript strict mode.
 */

// ---------------------------------------------------------------------------
// Namespace / top-level GPU object
// ---------------------------------------------------------------------------

interface GPU {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): GPUTextureFormat;
}

interface GPURequestAdapterOptions {
  powerPreference?: 'low-power' | 'high-performance';
  forceFallbackAdapter?: boolean;
}

interface GPUAdapter {
  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
  readonly isFallbackAdapter: boolean;
}

interface GPUDeviceDescriptor {
  requiredFeatures?: string[];
  requiredLimits?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// GPUDevice
// ---------------------------------------------------------------------------

interface GPUDevice extends EventTarget {
  readonly queue: GPUQueue;
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
  createSampler(descriptor?: GPUSamplerDescriptor): GPUSampler;
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
  createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout;
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// GPUQueue
// ---------------------------------------------------------------------------

interface GPUQueue {
  submit(commandBuffers: GPUCommandBuffer[]): void;
  writeBuffer(
    buffer: GPUBuffer,
    bufferOffset: number,
    data: BufferSource | SharedArrayBuffer | ArrayBufferView,
    dataOffset?: number,
    size?: number,
  ): void;
  writeTexture(
    destination: GPUImageCopyTexture,
    data: BufferSource | SharedArrayBuffer | ArrayBufferView,
    dataLayout: GPUImageDataLayout,
    size: GPUExtent3D,
  ): void;
}

interface GPUImageCopyTexture {
  texture: GPUTexture;
  mipLevel?: number;
  origin?: GPUOrigin3D;
  aspect?: GPUTextureAspect;
}

type GPUTextureAspect = 'all' | 'stencil-only' | 'depth-only';

interface GPUImageDataLayout {
  offset?: number;
  bytesPerRow?: number;
  rowsPerImage?: number;
}

type GPUExtent3D =
  | { width: number; height?: number; depthOrArrayLayers?: number }
  | [number, number?, number?];

type GPUOrigin3D =
  | { x?: number; y?: number; z?: number }
  | [number?, number?, number?];

// ---------------------------------------------------------------------------
// GPUBuffer
// ---------------------------------------------------------------------------

interface GPUBuffer {
  destroy(): void;
}

declare const GPUBufferUsage: {
  readonly MAP_READ: 0x0001;
  readonly MAP_WRITE: 0x0002;
  readonly COPY_SRC: 0x0004;
  readonly COPY_DST: 0x0008;
  readonly INDEX: 0x0010;
  readonly VERTEX: 0x0020;
  readonly UNIFORM: 0x0040;
  readonly STORAGE: 0x0080;
  readonly INDIRECT: 0x0100;
  readonly QUERY_RESOLVE: 0x0200;
};

interface GPUBufferDescriptor {
  size: number;
  usage: number;
  mappedAtCreation?: boolean;
  label?: string;
}

// ---------------------------------------------------------------------------
// GPUTexture
// ---------------------------------------------------------------------------

interface GPUTexture {
  createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
  destroy(): void;
}

interface GPUTextureView {}
interface GPUSampler {}

declare const GPUTextureUsage: {
  readonly COPY_SRC: 0x01;
  readonly COPY_DST: 0x02;
  readonly TEXTURE_BINDING: 0x04;
  readonly STORAGE_BINDING: 0x08;
  readonly RENDER_ATTACHMENT: 0x10;
};

interface GPUTextureDescriptor {
  size: GPUExtent3D;
  mipLevelCount?: number;
  sampleCount?: number;
  dimension?: GPUTextureDimension;
  format: GPUTextureFormat;
  usage: number;
  label?: string;
}

type GPUTextureDimension = '1d' | '2d' | '3d';

type GPUTextureFormat =
  | 'rgba8unorm'
  | 'rgba8unorm-srgb'
  | 'bgra8unorm'
  | 'bgra8unorm-srgb'
  | 'rgba16float'
  | 'r32float'
  | string;

interface GPUTextureViewDescriptor {
  format?: GPUTextureFormat;
  dimension?: GPUTextureViewDimension;
  aspect?: GPUTextureAspect;
  baseMipLevel?: number;
  mipLevelCount?: number;
  baseArrayLayer?: number;
  arrayLayerCount?: number;
}

type GPUTextureViewDimension = '1d' | '2d' | '2d-array' | 'cube' | 'cube-array' | '3d';

// ---------------------------------------------------------------------------
// Shaders / pipelines
// ---------------------------------------------------------------------------

interface GPUShaderModule {}
interface GPUShaderModuleDescriptor {
  code: string;
  label?: string;
}

interface GPUBindGroupLayout {}
interface GPUBindGroupLayoutDescriptor {
  entries: GPUBindGroupLayoutEntry[];
  label?: string;
}

interface GPUBindGroupLayoutEntry {
  binding: number;
  visibility: number;
  buffer?: GPUBufferBindingLayout;
  sampler?: GPUSamplerBindingLayout;
  texture?: GPUTextureBindingLayout;
  storageTexture?: GPUStorageTextureBindingLayout;
}

interface GPUBufferBindingLayout {
  type?: GPUBufferBindingType;
  hasDynamicOffset?: boolean;
  minBindingSize?: number;
}

type GPUBufferBindingType = 'uniform' | 'storage' | 'read-only-storage';

interface GPUSamplerBindingLayout {
  type?: GPUSamplerBindingType;
}

type GPUSamplerBindingType = 'filtering' | 'non-filtering' | 'comparison';

interface GPUTextureBindingLayout {
  sampleType?: GPUTextureSampleType;
  viewDimension?: GPUTextureViewDimension;
  multisampled?: boolean;
}

type GPUTextureSampleType = 'float' | 'unfilterable-float' | 'depth' | 'sint' | 'uint';

interface GPUStorageTextureBindingLayout {
  access?: GPUStorageTextureAccess;
  format: GPUTextureFormat;
  viewDimension?: GPUTextureViewDimension;
}

type GPUStorageTextureAccess = 'write-only' | 'read-only' | 'read-write';

declare const GPUShaderStage: {
  readonly VERTEX: 0x1;
  readonly FRAGMENT: 0x2;
  readonly COMPUTE: 0x4;
};

interface GPUPipelineLayout {}
interface GPUPipelineLayoutDescriptor {
  bindGroupLayouts: GPUBindGroupLayout[];
  label?: string;
}

interface GPURenderPipeline {
  getBindGroupLayout(index: number): GPUBindGroupLayout;
}

interface GPURenderPipelineDescriptor {
  layout: GPUPipelineLayout | 'auto';
  vertex: GPUVertexState;
  fragment?: GPUFragmentState;
  primitive?: GPUPrimitiveState;
  depthStencil?: GPUDepthStencilState;
  multisample?: GPUMultisampleState;
  label?: string;
}

interface GPUVertexState {
  module: GPUShaderModule;
  entryPoint?: string;
  buffers?: (GPUVertexBufferLayout | null)[];
  constants?: Record<string, number>;
}

interface GPUFragmentState {
  module: GPUShaderModule;
  entryPoint?: string;
  targets: (GPUColorTargetState | null)[];
  constants?: Record<string, number>;
}

interface GPUColorTargetState {
  format: GPUTextureFormat;
  blend?: GPUBlendState;
  writeMask?: number;
}

interface GPUBlendState {
  color: GPUBlendComponent;
  alpha: GPUBlendComponent;
}

interface GPUBlendComponent {
  operation?: GPUBlendOperation;
  srcFactor?: GPUBlendFactor;
  dstFactor?: GPUBlendFactor;
}

type GPUBlendOperation = 'add' | 'subtract' | 'reverse-subtract' | 'min' | 'max';

type GPUBlendFactor =
  | 'zero'
  | 'one'
  | 'src'
  | 'one-minus-src'
  | 'src-alpha'
  | 'one-minus-src-alpha'
  | 'dst'
  | 'one-minus-dst'
  | 'dst-alpha'
  | 'one-minus-dst-alpha'
  | 'src-alpha-saturated'
  | 'constant'
  | 'one-minus-constant';

interface GPUPrimitiveState {
  topology?: GPUPrimitiveTopology;
  stripIndexFormat?: GPUIndexFormat;
  frontFace?: GPUFrontFace;
  cullMode?: GPUCullMode;
  unclippedDepth?: boolean;
}

type GPUPrimitiveTopology =
  | 'point-list'
  | 'line-list'
  | 'line-strip'
  | 'triangle-list'
  | 'triangle-strip';

type GPUIndexFormat = 'uint16' | 'uint32';
type GPUFrontFace = 'ccw' | 'cw';
type GPUCullMode = 'none' | 'front' | 'back';

interface GPUDepthStencilState {
  format: GPUTextureFormat;
  depthWriteEnabled?: boolean;
  depthCompare?: GPUCompareFunction;
}

type GPUCompareFunction =
  | 'never'
  | 'less'
  | 'equal'
  | 'less-equal'
  | 'greater'
  | 'not-equal'
  | 'greater-equal'
  | 'always';

interface GPUMultisampleState {
  count?: number;
  mask?: number;
  alphaToCoverageEnabled?: boolean;
}

interface GPUVertexBufferLayout {
  arrayStride: number;
  stepMode?: GPUVertexStepMode;
  attributes: GPUVertexAttribute[];
}

type GPUVertexStepMode = 'vertex' | 'instance';

interface GPUVertexAttribute {
  format: GPUVertexFormat;
  offset: number;
  shaderLocation: number;
}

type GPUVertexFormat = string;

// ---------------------------------------------------------------------------
// Bind groups
// ---------------------------------------------------------------------------

interface GPUBindGroup {}

interface GPUBindGroupDescriptor {
  layout: GPUBindGroupLayout;
  entries: GPUBindGroupEntry[];
  label?: string;
}

type GPUBindGroupEntry = {
  binding: number;
  resource: GPUBindingResource;
};

type GPUBindingResource =
  | GPUSampler
  | GPUTextureView
  | GPUBufferBinding
  | GPUExternalTexture;

interface GPUBufferBinding {
  buffer: GPUBuffer;
  offset?: number;
  size?: number;
}

interface GPUExternalTexture {}

// ---------------------------------------------------------------------------
// Command encoding
// ---------------------------------------------------------------------------

interface GPUCommandEncoderDescriptor {
  label?: string;
}

interface GPUCommandEncoder {
  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
  copyTextureToBuffer(
    source: GPUImageCopyTexture,
    destination: GPUImageCopyBuffer,
    copySize: GPUExtent3D,
  ): void;
  finish(descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer;
}

interface GPUImageCopyBuffer {
  buffer: GPUBuffer;
  offset?: number;
  bytesPerRow?: number;
  rowsPerImage?: number;
}

interface GPUCommandBufferDescriptor {
  label?: string;
}

interface GPUCommandBuffer {}

interface GPURenderPassDescriptor {
  colorAttachments: (GPURenderPassColorAttachment | null)[];
  depthStencilAttachment?: GPURenderPassDepthStencilAttachment;
  label?: string;
}

interface GPURenderPassColorAttachment {
  view: GPUTextureView;
  resolveTarget?: GPUTextureView;
  clearValue?: GPUColor;
  loadOp: GPULoadOp;
  storeOp: GPUStoreOp;
}

interface GPURenderPassDepthStencilAttachment {
  view: GPUTextureView;
  depthClearValue?: number;
  depthLoadOp?: GPULoadOp;
  depthStoreOp?: GPUStoreOp;
  depthReadOnly?: boolean;
  stencilClearValue?: number;
  stencilLoadOp?: GPULoadOp;
  stencilStoreOp?: GPUStoreOp;
  stencilReadOnly?: boolean;
}

type GPUColor =
  | { r: number; g: number; b: number; a: number }
  | [number, number, number, number];

type GPULoadOp = 'load' | 'clear';
type GPUStoreOp = 'store' | 'discard';

interface GPURenderPassEncoder {
  setPipeline(pipeline: GPURenderPipeline): void;
  setBindGroup(
    index: number,
    bindGroup: GPUBindGroup | null,
    dynamicOffsets?: number[],
  ): void;
  setVertexBuffer(slot: number, buffer: GPUBuffer | null, offset?: number, size?: number): void;
  setIndexBuffer(
    buffer: GPUBuffer,
    indexFormat: GPUIndexFormat,
    offset?: number,
    size?: number,
  ): void;
  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void;
  drawIndexed(
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number,
  ): void;
  end(): void;
}

// ---------------------------------------------------------------------------
// Sampler descriptor
// ---------------------------------------------------------------------------

interface GPUSamplerDescriptor {
  addressModeU?: GPUAddressMode;
  addressModeV?: GPUAddressMode;
  addressModeW?: GPUAddressMode;
  magFilter?: GPUFilterMode;
  minFilter?: GPUFilterMode;
  mipmapFilter?: GPUMipmapFilterMode;
  lodMinClamp?: number;
  lodMaxClamp?: number;
  compare?: GPUCompareFunction;
  maxAnisotropy?: number;
  label?: string;
}

type GPUAddressMode = 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
type GPUFilterMode = 'nearest' | 'linear';
type GPUMipmapFilterMode = 'nearest' | 'linear';

// ---------------------------------------------------------------------------
// Canvas context
// ---------------------------------------------------------------------------

interface GPUCanvasContext {
  configure(configuration: GPUCanvasConfiguration): void;
  unconfigure(): void;
  getCurrentTexture(): GPUTexture;
}

interface GPUCanvasConfiguration {
  device: GPUDevice;
  format: GPUTextureFormat;
  usage?: number;
  viewFormats?: GPUTextureFormat[];
  colorSpace?: PredefinedColorSpace;
  alphaMode?: GPUCanvasAlphaMode;
}

type GPUCanvasAlphaMode = 'opaque' | 'premultiplied';
