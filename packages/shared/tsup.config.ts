import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  // fractional-indexing ships ESM only. Bundle it so the CJS build stays
  // require-able on Node 20, which cannot require() an ES module.
  noExternal: ['fractional-indexing'],
});
