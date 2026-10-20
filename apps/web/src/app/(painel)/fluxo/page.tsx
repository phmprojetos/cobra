import Link from 'next/link';
import { AlertTriangle, CalendarRange, TrendingUp } from 'lucide-react';
import { fluxoProjetado } from '@cobra/core';
import { Cabecalho } from '@/components/cabecalho';
import { GraficoFluxo, type PontoFluxo } from '@/components/grafico-fluxo';
import { KpiCard, Secao } from '@/components/painel/ui';
import { carregarPainel, comPeriodo, type SearchParams } from '@/lib/painel';
import { cn } from '@/lib/utils';

export default async function Fluxo({ searchParams }: PageProps<'/fluxo'>) {
  const sp = (await searchParams) as SearchParams;
  const { carteira, hoje, config, fmt } = await carregarPainel(sp);
  const semanas = fluxoProjetado(carteira.carteira, hoje, 8);
  const dados: PontoFluxo[] = semanas.map((s) => ({
    rotulo: fmt.dataCurta(s.inicio),
    inicio: s.inicio,
    emDia: s.emDia,
    vencido: s.vencido,
    emDiaFmt: fmt.dinheiro(s.emDia),
    vencidoFmt: fmt.dinheiro(s.vencido),
    totalFmt: fmt.dinheiro(s.emDia + s.vencido),
  }));
  const base = `/operacoes${comPeriodo(sp, {})}`;
  const link = (s: string, parte: string) => `${base}${base.includes('?') ? '&' : '?'}semana=${s}&parte=${parte}`;
  const emDia = semanas.reduce((a, s) => a + s.emDia, 0);
  const vencido = semanas.reduce((a, s) => a + s.vencido, 0);
  const pico = semanas.reduce((m, s) => (s.emDia + s.vencido > m.emDia + m.vencido ? s : m), semanas[0]!);

  return (
    <>
      <Cabecalho titulo="Fluxo de caixa projetado" subtitulo="Próximas 8 semanas (segunda a domingo). O vencido não pago aparece na semana atual." />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard rotulo="A receber em dia" valor={fmt.dinheiro(emDia)} href={link(semanas[0]!.inicio, 'emdia')} icone={TrendingUp} tom="em-dia" detalhe="nas próximas 8 semanas" />
        <KpiCard rotulo="Vencido não pago" valor={fmt.dinheiro(vencido)} href={link(semanas[0]!.inicio, 'vencido')} icone={AlertTriangle} tom={vencido ? 'atraso' : 'pago'} corValor detalhe={vencido ? 'cobrar nesta semana' : 'nenhum atraso'} />
        <KpiCard rotulo="Semana com mais entradas" valor={fmt.dinheiro(pico.emDia + pico.vencido)} href={link(pico.inicio, 'emdia')} icone={CalendarRange} detalhe={`${fmt.dataCurta(pico.inicio)} a ${fmt.dataCurta(pico.fim)}`} />
      </section>

      <Secao
        titulo="Entradas por semana"
        acao={
          <div className="flex gap-4 text-xs" aria-label="Legenda">
            <span className="flex items-center gap-1.5">
              <span className="bg-em-dia-fill size-2.5 rounded-sm" aria-hidden /> Em dia
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-atraso-fill size-2.5 rounded-sm" aria-hidden /> Vencido não pago
            </span>
          </div>
        }
      >
        <GraficoFluxo dados={dados} moeda={config.moeda} locale={config.locale} linkBase={base} />
      </Secao>

      <Secao titulo="Detalhamento" semPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Semana</th>
                <th className="px-3 py-3 text-right font-medium">Em dia</th>
                <th className="px-3 py-3 text-right font-medium">Vencido</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {semanas.map((s, i) => (
                <tr key={s.inicio} className={cn('hover:bg-muted/40', i === 0 && 'bg-muted/30')}>
                  <td className="px-5 py-3">
                    {fmt.dataCurta(s.inicio)} – {fmt.dataCurta(s.fim)}
                    {i === 0 && <span className="text-muted-foreground ml-2 text-xs">esta semana</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {s.emDia ? (
                      <Link className="text-em-dia hover:underline" href={link(s.inicio, 'emdia')}>
                        {fmt.dinheiro(s.emDia)}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {s.vencido > 0 ? (
                      <Link className="text-atraso font-medium hover:underline" href={link(s.inicio, 'vencido')}>
                        {fmt.dinheiro(s.vencido)}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={cn('px-5 py-3 text-right tabular-nums', s.emDia + s.vencido ? 'font-semibold' : 'text-muted-foreground')}>{fmt.dinheiro(s.emDia + s.vencido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>
    </>
  );
}
