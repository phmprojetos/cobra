import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/tipos.ts'],
      thresholds: { lines: 100, functions: 100, branches: 95, statements: 100 },
    },
  },
});
