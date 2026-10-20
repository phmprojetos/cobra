import { AlertTriangle, Ban, CheckCircle2, CircleDot, Clock, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Status com ícone + rótulo (cor nunca sozinha):
 * verde = pago/quitado · vermelho = atrasado/perdido · âmbar = vence em breve · azul = em dia.
 */
const MAPA: Record<string, { rotulo: string; icone: typeof Clock; classe: string }> = {
  atrasada: { rotulo: 'Atrasada', icone: AlertTriangle, classe: 'text-atraso bg-atraso-fill/12 ring-atraso-fill/30' },
  perdida: { rotulo: 'Perdida', icone: XCircle, classe: 'text-atraso bg-atraso-fill/12 ring-atraso-fill/30' },
  breve: { rotulo: 'Vence em breve', icone: Clock, classe: 'text-breve bg-breve-fill/14 ring-breve-fill/30' },
  quitada: { rotulo: 'Quitada', icone: CheckCircle2, classe: 'text-pago bg-pago-fill/12 ring-pago-fill/30' },
  paga: { rotulo: 'Paga', icone: CheckCircle2, classe: 'text-pago bg-pago-fill/12 ring-pago-fill/30' },
  ativa: { rotulo: 'Em dia', icone: CircleDot, classe: 'text-em-dia bg-em-dia-fill/10 ring-em-dia-fill/25' },
  aberta: { rotulo: 'Em aberto', icone: CircleDot, classe: 'text-em-dia bg-em-dia-fill/10 ring-em-dia-fill/25' },
  parcial: { rotulo: 'Parcial', icone: CircleDot, classe: 'text-em-dia bg-em-dia-fill/10 ring-em-dia-fill/25' },
  renegociada: { rotulo: 'Renegociada', icone: RefreshCw, classe: 'text-em-dia bg-em-dia-fill/10 ring-em-dia-fill/25' },
  cancelada: { rotulo: 'Cancelada', icone: Ban, classe: 'text-muted-foreground bg-muted ring-border line-through' },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = MAPA[status] ?? { rotulo: status, icone: CircleDot, classe: 'text-muted-foreground bg-muted ring-border' };
  const Icone = s.icone;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', s.classe, className)}>
      <Icone className="size-3" aria-hidden />
      {s.rotulo}
    </span>
  );
}
