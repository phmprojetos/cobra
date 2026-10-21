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
  // fetch/AbortController nativos no lugar dos polyfills do grammY (ver shims/).
  alias: { 'node-fetch': './shims/node-fetch.js', 'abort-controller': './shims/abort-controller.js' },
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
