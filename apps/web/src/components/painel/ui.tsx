import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Tom com significado: pago (verde), atraso (vermelho), breve (âmbar), em-dia (azul), neutro. */
export type Tom = 'pago' | 'atraso' | 'breve' | 'em-dia' | 'neutro';

export const TOM_TEXTO: Record<Tom, string> = {
  pago: 'text-pago',
  atraso: 'text-atraso',
  breve: 'text-breve',
  'em-dia': 'text-em-dia',
  neutro: 'text-foreground',
};

const TOM_CHIP: Record<Tom, string> = {
  pago: 'bg-pago-fill/12 text-pago ring-pago-fill/25',
  atraso: 'bg-atraso-fill/12 text-atraso ring-atraso-fill/25',
  breve: 'bg-breve-fill/14 text-breve ring-breve-fill/25',
  'em-dia': 'bg-em-dia-fill/12 text-em-dia ring-em-dia-fill/25',
  neutro: 'bg-muted text-muted-foreground ring-border',
};

const TOM_BARRA_TOPO: Record<Tom, string> = {
  pago: 'before:bg-pago-fill',
  atraso: 'before:bg-atraso-fill',
  breve: 'before:bg-breve-fill',
  'em-dia': 'before:bg-em-dia-fill',
  neutro: 'before:bg-transparent',
};

/** Card de indicador (stat tile). Todo número é clicável e leva à lista que o compõe. */
export function KpiCard({
  rotulo,
  valor,
  href,
  icone: Icone,
  tom = 'neutro',
  corValor = false,
  detalhe,
  rodape,
}: {
  rotulo: string;
  valor: string;
  href: string;
  icone: LucideIcon;
  tom?: Tom;
  /** Pinta o número com a cor do tom (ex.: vencido em vermelho, recebido em verde). */
  corValor?: boolean;
  detalhe?: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group bg-card focus-visible:ring-ring relative flex flex-col gap-3 overflow-hidden rounded-xl border p-5 shadow-xs outline-none transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2',
        "before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:content-['']",
        TOM_BARRA_TOPO[tom],
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm font-medium">{rotulo}</span>
        <span className={cn('flex size-9 items-center justify-center rounded-lg ring-1', TOM_CHIP[tom])}>
          <Icone className="size-4.5" aria-hidden />
        </span>
      </div>
      <div className={cn('text-2xl font-semibold tracking-tight tabular-nums lg:text-[1.7rem]', corValor ? TOM_TEXTO[tom] : 'text-foreground')}>
        {valor}
      </div>
      {detalhe && <div className="text-muted-foreground -mt-1 text-xs">{detalhe}</div>}
      {rodape}
      <ArrowUpRight className="text-muted-foreground absolute right-3 bottom-3 size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </Link>
  );
}

/** Valor monetário: negativo em vermelho automaticamente; `tom` força a cor (ex.: recebido em verde). */
export function Dinheiro({ centavos, texto, tom, sinal = false, className }: { centavos: number; texto: string; tom?: Tom; sinal?: boolean; className?: string }) {
  const cor = tom ?? (centavos < 0 ? 'atraso' : 'neutro');
  return (
    <span className={cn('tabular-nums', TOM_TEXTO[cor], className)}>
      {sinal && centavos > 0 ? '+' : ''}
      {texto}
    </span>
  );
}

/** Barra de quitação: a parte paga é sempre verde (o atraso aparece no status, não aqui). */
export function BarraProgresso({ pago, total, className }: { pago: number; total: number; atrasado?: boolean; className?: string }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (pago / total) * 100)) : 0;
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Percentual pago">
        <div className="bg-pago-fill h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">{Math.round(pct)}%</span>
    </div>
  );
}

export interface SegmentoComposicao {
  rotulo: string;
  valor: number;
  valorFmt: string;
  tom: Exclude<Tom, 'neutro'>;
  href?: string;
}

const TOM_FILL: Record<Exclude<Tom, 'neutro'>, string> = {
  pago: 'bg-pago-fill',
  atraso: 'bg-atraso-fill',
  breve: 'bg-breve-fill',
  'em-dia': 'bg-em-dia-fill',
};

/** Barra empilhada horizontal (composição) com legenda rotulada: cor nunca sozinha. */
export function BarraComposicao({ segmentos }: { segmentos: SegmentoComposicao[] }) {
  const total = segmentos.reduce((a, s) => a + s.valor, 0);
  return (
    <div className="space-y-4">
      <div className="bg-muted flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {total > 0 &&
          segmentos
            .filter((s) => s.valor > 0)
            .map((s) => <div key={s.rotulo} className={cn('h-full first:rounded-l-full last:rounded-r-full', TOM_FILL[s.tom])} style={{ width: `${(s.valor / total) * 100}%` }} title={`${s.rotulo}: ${s.valorFmt}`} />)}
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {segmentos.map((s) => {
          const conteudo = (
            <>
              <span className="flex items-center gap-2 text-sm">
                <span className={cn('size-2.5 rounded-sm', TOM_FILL[s.tom])} aria-hidden />
                <span className="text-muted-foreground">{s.rotulo}</span>
              </span>
              <span className="mt-1 block font-semibold tabular-nums">{s.valorFmt}</span>
              <span className="text-muted-foreground text-xs tabular-nums">{total > 0 ? `${Math.round((s.valor / total) * 100)}% da carteira` : '—'}</span>
            </>
          );
          return (
            <li key={s.rotulo}>
              {s.href ? (
                <Link href={s.href} className="hover:bg-muted/60 block rounded-lg p-2 transition-colors">
                  {conteudo}
                </Link>
              ) : (
                <div className="p-2">{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Secao({
  titulo,
  descricao,
  acao,
  children,
  className,
  semPadding = false,
}: {
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  semPadding?: boolean;
}) {
  return (
    <section className={cn('bg-card rounded-xl border shadow-xs', className)}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-5 py-4">
        <div>
          <h2 className="font-semibold tracking-tight">{titulo}</h2>
          {descricao && <p className="text-muted-foreground mt-0.5 text-sm">{descricao}</p>}
        </div>
        {acao}
      </header>
      <div className={semPadding ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

export function Vazio({ icone: Icone, titulo, texto }: { icone: LucideIcon; titulo: string; texto?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
        <Icone className="size-5" aria-hidden />
      </span>
      <p className="font-medium">{titulo}</p>
      {texto && <p className="text-muted-foreground max-w-sm text-sm">{texto}</p>}
    </div>
  );
}

export function LinkAcao({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium transition-colors">
      {children}
      <ArrowUpRight className="size-3.5" aria-hidden />
    </Link>
  );
}

/** Iniciais para o avatar do cliente. */
export function Avatar({ nome, tom = 'neutro' }: { nome: string; tom?: Tom }) {
  const ini = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1', TOM_CHIP[tom])} aria-hidden>
      {ini || '?'}
    </span>
  );
}

/** Pontualidade: verde ≥ 80%, âmbar ≥ 50%, vermelho abaixo. */
export function tomPontualidade(p: number | null): Tom {
  if (p === null) return 'neutro';
  return p >= 0.8 ? 'pago' : p >= 0.5 ? 'breve' : 'atraso';
}
