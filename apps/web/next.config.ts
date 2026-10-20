import path from 'node:path';
import type { NextConfig } from 'next';

// Em desenvolvimento, usa o .env da raiz do monorepo (na Vercel, as variáveis vêm do painel).
try {
  process.loadEnvFile('../../.env');
} catch {}

const nextConfig: NextConfig = {
  // Permite build de verificação sem colidir com o `next dev` em execução (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Imagem Docker enxuta (server.js + dependências rastreadas a partir da raiz do monorepo).
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  // Painel autenticado e 100% dinâmico: sem Cache Components/PPR.
  transpilePackages: ['@cobra/core', '@cobra/db'],
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
};

export default nextConfig;
