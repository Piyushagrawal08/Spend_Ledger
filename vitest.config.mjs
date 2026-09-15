import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Mirrors the `@/` alias from jsconfig.json so tests import modules by exactly
// the same specifier the app uses — a test can never pass against a different
// copy of a module than the one that ships.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
