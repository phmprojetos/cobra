import type { MetadataRoute } from 'next';

/** Permite "Adicionar à tela inicial" no celular com o ícone e o nome do app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cobra · Gestão de empréstimos',
    short_name: 'Cobra',
    description: 'Gestão pessoal de empréstimos',
    start_url: '/',
    display: 'standalone',
    // Mesmo preto do fundo do logo
    background_color: '#0a0a0b',
    theme_color: '#0a0a0b',
    lang: 'pt-BR',
    icons: [
      { src: '/marca/cobra-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/marca/cobra-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/marca/cobra-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
