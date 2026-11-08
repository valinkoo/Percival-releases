import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // DOMPurify needs a DOM.
    environment: 'jsdom',
  },
});
