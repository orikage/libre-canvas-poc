FROM rust:1.77-slim-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Rust nightly and wasm target
RUN rustup toolchain install nightly \
    && rustup default nightly \
    && rustup target add wasm32-unknown-unknown

# Install wasm-pack and cargo-watch
RUN cargo install wasm-pack cargo-watch

# Working directory
WORKDIR /app

# Expose Vite dev server port
EXPOSE 5173

# Default command
CMD ["make", "dev"]
