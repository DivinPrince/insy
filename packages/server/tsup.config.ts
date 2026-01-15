import { defineConfig } from 'tsup';

export default defineConfig([
  // Library build (for imports)
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    external: ['@insy/shared', '@insy/client'],
  },
  // Standalone CLI build (all deps bundled)
  {
    entry: { 'cli': 'src/index.ts' },
    format: ['cjs'],
    outDir: 'dist',
    platform: 'node',
    clean: false,
    sourcemap: false,
    splitting: false,
    treeshake: true,
    noExternal: [/.*/],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
