import type { NextConfig } from 'next';

// Em desenvolvimento, usa o .env da raiz do monorepo (na Vercel, as variáveis vêm do painel).
try {
  process.loadEnvFile('../../.env');
} catch {}

const nextConfig: NextConfig = {
  // Permite build de verificação sem colidir com o `next dev` em execução (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Painel autenticado e 100% dinâmico: sem Cache Components/PPR.
  transpilePackages: ['@cobra/core', '@cobra/db'],
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
};

export default nextConfig;
