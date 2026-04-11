import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig(({ command }) => ({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  plugins: [wasm(), topLevelAwait()],
  base: command === 'build' ? '/libre-canvas-poc/' : '/',
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: 'esbuild',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
}));
