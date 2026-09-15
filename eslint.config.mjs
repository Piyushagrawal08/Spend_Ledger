import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

// Next 16 removed the `next lint` command, so the checker runs as plain
// eslint. eslint-config-next ships a flat config already, so it is spread in
// directly — no compatibility wrapper needed.
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'backups/**'],
  },
  ...nextCoreWebVitals,
];

export default config;
