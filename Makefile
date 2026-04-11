.PHONY: all setup build-wasm dev build clean docker-build docker-dev docker-shell

# Default target
all: build

# ============================================
# Local Development (requires Rust + Node.js)
# ============================================

# Initial setup - run once after cloning
setup:
	cd core && cargo check
	cd web && npm install

# Build Rust core to WebAssembly
build-wasm:
	cd core && wasm-pack build --target web --out-dir ../web/src/wasm/pkg

# Start development server (builds wasm first)
dev: build-wasm
	cd web && npm run dev -- --host 0.0.0.0

# Production build
build: build-wasm
	cd web && npm run build

# Clean build artifacts
clean:
	cd core && cargo clean
	rm -rf web/src/wasm/pkg
	rm -rf web/dist
	rm -rf web/node_modules

# ============================================
# Docker Development
# ============================================

# Build Docker image
docker-build:
	docker compose build

# Start development in Docker container
docker-dev:
	docker compose up

# Run development in background
docker-dev-bg:
	docker compose up -d

# Stop Docker containers
docker-stop:
	docker compose down

# Open shell in Docker container
docker-shell:
	docker compose run --rm dev bash

# Clean Docker volumes
docker-clean:
	docker compose down -v

# ============================================
# Utilities
# ============================================

# Watch and rebuild wasm on changes (local only)
watch-wasm:
	cd core && cargo watch -s "wasm-pack build --target web --out-dir ../web/src/wasm/pkg"

# Run Rust tests
test:
	cd core && cargo test

# Format code
fmt:
	cd core && cargo fmt
	cd web && npm run format 2>/dev/null || true

# Lint code
lint:
	cd core && cargo clippy
	cd web && npm run lint 2>/dev/null || true
