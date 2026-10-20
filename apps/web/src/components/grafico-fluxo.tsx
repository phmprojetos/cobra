'use client';

import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

export interface PontoFluxo {
  rotulo: string;
  inicio: string;
  emDia: number;
  vencido: number;
  emDiaFmt: string;
  vencidoFmt: string;
  totalFmt: string;
}

function Dica({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const p = payload?.[0]?.payload as PontoFluxo | undefined;
  if (!active || !p) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">Semana de {p.rotulo}</div>
      <div className="flex items-center gap-2">
        <span className="bg-em-dia size-2 rounded-sm" aria-hidden /> Em dia: <span className="ml-auto tabular-nums">{p.emDiaFmt}</span>
      </div>
      {p.vencido > 0 && (
        <div className="flex items-center gap-2">
          <span className="bg-atraso size-2 rounded-sm" aria-hidden /> Vencido não pago: <span className="ml-auto tabular-nums">{p.vencidoFmt}</span>
        </div>
      )}
      <div className="mt-1 border-t pt-1">
        Total <span className="float-right font-medium tabular-nums">{p.totalFmt}</span>
      </div>
    </div>
  );
}

/**
 * Barras empilhadas por semana: "em dia" (azul) e "vencido não pago" (vermelho = atraso).
 * Paleta validada para daltonismo e contraste nos dois temas. Clique leva às operações.
 */
export function GraficoFluxo({ dados, moeda, locale, linkBase }: { dados: PontoFluxo[]; moeda: string; locale: string; linkBase: string }) {
  const router = useRouter();
  const compacto = new Intl.NumberFormat(locale, { style: 'currency', currency: moeda, notation: 'compact', maximumFractionDigits: 1 });
  const ir = (p: PontoFluxo, parte: 'emdia' | 'vencido') =>
    router.push(`${linkBase}${linkBase.includes('?') ? '&' : '?'}semana=${p.inicio}&parte=${parte}`);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={dados} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            tickFormatter={(v: number) => compacto.format(v / 100)}
          />
          <Tooltip content={Dica} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
          <Bar
            dataKey="vencido"
            name="Vencido não pago"
            stackId="s"
            fill="var(--atraso)"
            stroke="var(--background)"
            strokeWidth={2}
            className="cursor-pointer"
            onClick={(d) => ir(d.payload as PontoFluxo, 'vencido')}
          />
          <Bar
            dataKey="emDia"
            name="Em dia"
            stackId="s"
            fill="var(--em-dia)"
            stroke="var(--background)"
            strokeWidth={2}
            radius={[4, 4, 0, 0]}
            className="cursor-pointer"
            onClick={(d) => ir(d.payload as PontoFluxo, 'emdia')}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
