import { defineConfig } from 'vitest/config';

// Variáveis do .env da raiz (Supabase cloud, chaves). Ausente = testes de integração pulados.
try {
  process.loadEnvFile('../../.env');
} catch {}

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: process.env.RUN_LLM_TESTS ? [] : ['test/**/*.llm.test.ts'],
    testTimeout: 60_000,
  },
});
