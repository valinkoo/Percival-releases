import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Compiles the runes of `.svelte.ts` modules.
  plugins: [svelte()],
  test: {
    include: ['src/**/*.test.ts'],
    // DOMPurify needs a DOM.
    environment: 'jsdom',
  },
});
