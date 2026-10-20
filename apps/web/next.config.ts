import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Painel autenticado e 100% dinâmico: sem Cache Components/PPR.
  transpilePackages: ['@cobra/core', '@cobra/db'],
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
};

export default nextConfig;
