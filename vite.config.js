import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    // Installable, fully offline app: every asset (fonts, RAW decoder) is precached on first visit.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'MinimalFrame',
        short_name: 'MinimalFrame',
        description: 'Frame, edit and caption your photos for Instagram. Everything stays on your device.',
        theme_color: '#0c0c10',
        background_color: '#0c0c10',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        // Lets the installed app appear in the phone's share sheet (handled by public/share-target.js).
        share_target: {
          action: 'share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [{
              name: 'photos',
              accept: ['image/*', '.dng', '.arw', '.cr2', '.cr3', '.nef', '.raf', '.orf', '.rw2', '.pef', '.srw'],
            }],
          },
        },
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // the LibRaw wasm is ~1.4 MB
        importScripts: ['share-target.js'],
      },
    }),
  ],
  // libraw-wasm loads its worker and .wasm via new URL(..., import.meta.url); pre-bundling breaks those paths.
  optimizeDeps: { exclude: ['libraw-wasm'] },
  // The RAW and HEIF decoders are big on purpose and load only when such a file is opened.
  build: { chunkSizeWarningLimit: 2100 },
  worker: { format: 'es' },
})
