import { build } from 'esbuild';

// Empacota o bot e os pacotes do workspace num único arquivo ESM para a imagem Docker.
await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/main.js',
  sourcemap: true,
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
