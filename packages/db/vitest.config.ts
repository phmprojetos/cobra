import { defineConfig } from 'vitest/config';

// Testes de integração: exigem `supabase start` (pulados se o banco local não responder).
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], fileParallelism: false, testTimeout: 20_000 },
});
