'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

const ITENS = [
  { href: '/', rotulo: 'Início' },
  { href: '/fluxo', rotulo: 'Fluxo' },
  { href: '/operacoes', rotulo: 'Operações' },
  { href: '/clientes', rotulo: 'Clientes' },
  { href: '/configuracoes', rotulo: 'Config.' },
];

/** Navegação que preserva o período global (?p, ?de, ?ate). */
export function Navegacao() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const q = new URLSearchParams();
  for (const k of ['p', 'de', 'ate']) {
    const v = sp.get(k);
    if (v) q.set(k, v);
  }
  const sufixo = q.toString() ? `?${q}` : '';
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 text-sm">
      {ITENS.map((i) => {
        const ativo = i.href === '/' ? pathname === '/' : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={`${i.href}${sufixo}`}
            className={cn(
              'rounded-md px-3 py-1.5 whitespace-nowrap transition-colors',
              ativo ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {i.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
