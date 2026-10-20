import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { ProvedorTema } from '@/components/tema';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Cobra',
  description: 'Gestão pessoal de empréstimos',
  // Ícones: src/app/icon.png (favicon) e apple-icon.png; manifesto em app/manifest.ts.
  appleWebApp: { title: 'Cobra', capable: true, statusBarStyle: 'default' },
};

// viewportFit cover: permite usar env(safe-area-inset-bottom) na barra do rodapé.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ProvedorTema>
          {children}
          <Toaster richColors position="top-center" />
        </ProvedorTema>
      </body>
    </html>
  );
}
