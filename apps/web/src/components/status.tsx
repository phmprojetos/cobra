import { AlertTriangle, CheckCircle2, Clock, Ban, XCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Status com ícone + rótulo (cor nunca sozinha). Só atraso (vermelho) e
 * vence em breve (âmbar) têm cor; o resto é neutro.
 */
const MAPA: Record<string, { rotulo: string; icone: typeof Clock; classe: string }> = {
  atrasada: { rotulo: 'Atrasada', icone: AlertTriangle, classe: 'text-atraso border-atraso/40 bg-atraso/10' },
  breve: { rotulo: 'Vence em breve', icone: Clock, classe: 'text-breve border-breve/40 bg-breve/10' },
  ativa: { rotulo: 'Ativa', icone: Clock, classe: 'text-muted-foreground' },
  aberta: { rotulo: 'Aberta', icone: Clock, classe: 'text-muted-foreground' },
  parcial: { rotulo: 'Parcial', icone: Clock, classe: 'text-muted-foreground' },
  renegociada: { rotulo: 'Renegociada', icone: RefreshCw, classe: 'text-muted-foreground' },
  quitada: { rotulo: 'Quitada', icone: CheckCircle2, classe: 'text-muted-foreground' },
  paga: { rotulo: 'Paga', icone: CheckCircle2, classe: 'text-muted-foreground' },
  perdida: { rotulo: 'Perdida', icone: XCircle, classe: 'text-muted-foreground' },
  cancelada: { rotulo: 'Cancelada', icone: Ban, classe: 'text-muted-foreground line-through' },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = MAPA[status] ?? { rotulo: status, icone: Clock, classe: 'text-muted-foreground' };
  const Icone = s.icone;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap', s.classe, className)}>
      <Icone className="size-3" aria-hidden />
      {s.rotulo}
    </span>
  );
}
