'use client';

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

/** Abas horizontais (celular). */
export function NavTopo() {
  const pathname = usePathname();
  const sufixo = useSufixo();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 text-sm">
      {ITENS.map((i) => {
        const on = ativo(pathname, i.href);
        return (
          <Link
            key={i.href}
            href={`${i.href}${sufixo}`}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition-colors',
              on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <i.icone className="size-3.5" aria-hidden />
            {i.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
