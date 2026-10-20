import { defineConfig } from 'vitest/config';

// Variáveis do .env da raiz (Supabase cloud, chaves). Ausente = testes de integração pulados.
try {
  process.loadEnvFile('../../.env');
} catch {}

// Testes de integração: exigem `supabase start` (pulados se o banco local não responder).
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], fileParallelism: false, testTimeout: 20_000 },
});
