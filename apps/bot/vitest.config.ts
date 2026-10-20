import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: process.env.RUN_LLM_TESTS ? [] : ['test/**/*.llm.test.ts'],
    testTimeout: 60_000,
  },
});
