'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { BarChart3, FileText, LayoutDashboard, Settings, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ITENS = [
  { href: '/', rotulo: 'Visão geral', icone: LayoutDashboard },
  { href: '/fluxo', rotulo: 'Fluxo de caixa', icone: BarChart3 },
  { href: '/operacoes', rotulo: 'Operações', icone: FileText },
  { href: '/clientes', rotulo: 'Clientes', icone: Users },
  { href: '/configuracoes', rotulo: 'Configurações', icone: Settings },
];

/** Preserva o período global (?p, ?de, ?ate) ao navegar. */
function useSufixo() {
  const sp = useSearchParams();
  const q = new URLSearchParams();
  for (const k of ['p', 'de', 'ate']) {
    const v = sp.get(k);
    if (v) q.set(k, v);
  }
  return q.toString() ? `?${q}` : '';
}

function ativo(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/** Menu lateral (desktop). */
export function NavLateral() {
  const pathname = usePathname();
  const sufixo = useSufixo();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {ITENS.map((i) => {
        const on = ativo(pathname, i.href);
        return (
          <Link
            key={i.href}
            href={`${i.href}${sufixo}`}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              on ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
            )}
          >
            <i.icone className="size-4" aria-hidden />
            {i.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Navegação no rodapé (celular): 5 itens, com "Início" em destaque no centro.
 * Fixa na base, respeitando a área segura (barra de gestos do iPhone/Android).
 */
export function NavRodape() {
  const pathname = usePathname();
  const sufixo = useSufixo();
  const itens = [
    { href: '/operacoes', rotulo: 'Operações', icone: FileText },
    { href: '/clientes', rotulo: 'Clientes', icone: Users },
    { href: '/', rotulo: 'Início', icone: LayoutDashboard, centro: true },
    { href: '/fluxo', rotulo: 'Fluxo', icone: BarChart3 },
    { href: '/configuracoes', rotulo: 'Ajustes', icone: Settings },
  ];
  return (
    <nav
      aria-label="Navegação principal"
      className="bg-card/95 supports-[backdrop-filter]:bg-card/85 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.06)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-5">
        {itens.map((i) => {
          const on = ativo(pathname, i.href);
          if (i.centro) {
            return (
              <li key={i.href} className="flex justify-center">
                <Link href={`${i.href}${sufixo}`} aria-current={on ? 'page' : undefined} className="-mt-6 flex flex-col items-center gap-1">
                  {/* Botão central com o símbolo da marca (cobra) */}
                  <span
                    className={cn(
                      'ring-background flex size-14 items-center justify-center overflow-hidden rounded-full bg-[#0a0a0b] shadow-lg ring-4 transition-transform active:scale-95',
                      on && 'shadow-lime-500/30',
                    )}
                  >
                    <Image src="/cobra.png" alt="" width={56} height={56} className="size-14 scale-110 object-cover" />
                  </span>
                  <span className={cn('text-[11px] font-semibold', on ? 'text-foreground' : 'text-muted-foreground')}>{i.rotulo}</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={i.href}>
              <Link
                href={`${i.href}${sufixo}`}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <i.icone className={cn('size-5', on && 'text-foreground')} aria-hidden />
                {i.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
