import { defineConfig } from 'vitest/config';
import { transformWithOxc } from 'vite';
import { fileURLToPath } from 'node:url';

// This repo writes JSX into `.js` files. Next compiles them without being
// told; Vite decides how to parse a file from its extension, so a test that
// imports a component fails on the first `<div>` with "invalid JS syntax".
// This hands those files to the transformer as JSX explicitly, which is what
// lets tests/lendingView.test.js render a screen. Source files only — nothing
// in node_modules is touched, and a `.js` file with no JSX in it is left alone.
function jsxInJsFiles() {
  return {
    name: 'spendledger:jsx-in-js',
    enforce: 'pre',
    async transform(code, id) {
      const file = id.split('?')[0];
      if (!file.endsWith('.js') || file.includes('node_modules')) return null;
      if (!/<[A-Za-z/]/.test(code)) return null;
      const out = await transformWithOxc(code, file, { lang: 'jsx' });
      return { code: out.code, map: out.map };
    },
  };
}

// The `@/` alias mirrors jsconfig.json so tests import modules by exactly the
// same specifier the app uses — a test can never pass against a different copy
// of a module than the one that ships.
export default defineConfig({
  plugins: [jsxInJsFiles()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
