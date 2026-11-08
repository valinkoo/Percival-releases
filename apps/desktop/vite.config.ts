import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Tauri expects a fixed dev server port (see devUrl in src-tauri/tauri.conf.json).
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: 'localhost',
  },
  build: {
    // WebView2 on Windows 11 is a recent Chromium.
    target: 'es2022',
    sourcemap: false,
  },
});
