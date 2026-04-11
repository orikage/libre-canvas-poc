# LibreCanvas POC

A lightweight, open-source paint tool proof of concept.

## Features

- **Smooth Drawing**: SAI-style stroke smoothing using EMA algorithm (Rust/WebAssembly)
- **Pressure Sensitivity**: Pen tablet support with pressure/tilt
- **Layer System**: Multiple layers with blend modes (Normal, Multiply, Screen, Overlay)
- **File Operations**: Save/Load (.lcv format), PNG export
- **Cross-Browser**: Canvas2D rendering with WebGPU ready architecture

## Tech Stack

- **Core Engine**: Rust + WebAssembly (wasm-bindgen)
- **Frontend**: TypeScript + Vite
- **Rendering**: Canvas2D (WebGPU planned)
- **Development**: Docker containerized environment

## Quick Start

### Local Development

```bash
# Install dependencies
make setup

# Build WebAssembly and start dev server
make dev
```

### Docker Development

```bash
# Build and start development environment
make docker-dev
```

Access at `http://localhost:5173`

## Project Structure

```
libre-canvas-poc/
├── core/                 # Rust/WebAssembly engine
│   └── src/
│       ├── brush/        # Color blending algorithms
│       ├── canvas/       # Tile-based canvas
│       ├── layer/        # Layer management
│       ├── stroke/       # Smoothing & dab generation
│       └── lib.rs
├── web/                  # TypeScript frontend
│   └── src/
│       ├── canvas/       # Input handling
│       ├── file/         # Save/Load
│       ├── layer/        # Layer UI
│       ├── renderer/     # Canvas2D/WebGPU
│       └── ui/           # Toolbar, panels
├── docker/               # Docker configuration
└── docs/                 # Design documentation
```

## Commands

| Command | Description |
|---------|-------------|
| `make setup` | Install Rust and Node.js dependencies |
| `make dev` | Build wasm and start dev server |
| `make build` | Production build |
| `make docker-dev` | Run development in Docker |
| `make test` | Run Rust tests |

## Keyboard Shortcuts

- `Ctrl/Cmd + S`: Save
- `Ctrl/Cmd + O`: Load

## Browser Support

- Chrome/Edge: Full support (File System Access API)
- Firefox/Safari: Fallback download/upload

## License

MIT
