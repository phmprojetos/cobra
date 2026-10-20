import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Stat tile clicável: todo número leva à lista que o compõe. */
export function Kpi({
  rotulo,
  valor,
  href,
  detalhe,
  alerta = false,
}: {
  rotulo: string;
  valor: string;
  href: string;
  detalhe?: string;
  /** Vermelho só quando há atraso (com ícone, nunca só a cor). */
  alerta?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group bg-card hover:bg-muted/50 focus-visible:ring-ring flex flex-col gap-1 rounded-xl border p-4 outline-none transition-colors focus-visible:ring-2',
        alerta && 'border-atraso/50',
      )}
    >
      <span className="text-muted-foreground flex items-center justify-between text-xs">
        <span className="flex items-center gap-1">
          {alerta && <AlertTriangle className="text-atraso size-3.5" aria-label="Atenção" />}
          {rotulo}
        </span>
        <ChevronRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </span>
      <span className={cn('text-xl font-semibold tabular-nums tracking-tight sm:text-2xl', alerta && 'text-atraso')}>{valor}</span>
      {detalhe && <span className="text-muted-foreground text-xs">{detalhe}</span>}
    </Link>
  );
}
