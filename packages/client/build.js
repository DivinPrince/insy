import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const watch = process.argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: [join(__dirname, 'src/index.ts')],
  bundle: true,
  minify: !watch,
  sourcemap: watch,
  target: 'es2020',
  format: 'iife',
  outfile: join(__dirname, 'dist/client.js'),
  jsxImportSource: 'preact',
  jsx: 'automatic',
  loader: { '.ts': 'tsx', '.js': 'jsx' },
  platform: 'browser',
  define: {
    'process.env.NODE_ENV': watch ? '"development"' : '"production"',
  },
  banner: {
    js: '/* Insy Client v0.1.0 | MIT License */',
  },
});

if (watch) {
  await ctx.watch();
  console.log('👀 Watching for changes...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('✅ Build complete!');
}
