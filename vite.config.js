import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // libraw-wasm loads its worker and .wasm via new URL(..., import.meta.url); pre-bundling breaks those paths.
  optimizeDeps: { exclude: ['libraw-wasm'] },
  worker: { format: 'es' },
})
