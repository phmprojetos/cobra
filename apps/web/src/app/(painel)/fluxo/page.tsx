import Link from 'next/link';
import { fluxoProjetado } from '@cobra/core';
import { Cabecalho } from '@/components/cabecalho';
import { GraficoFluxo, type PontoFluxo } from '@/components/grafico-fluxo';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { carregarPainel, comPeriodo, type SearchParams } from '@/lib/painel';

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
  const total = semanas.reduce((a, s) => a + s.emDia + s.vencido, 0);

  return (
    <>
      <Cabecalho titulo="Fluxo projetado" />
      <p className="text-muted-foreground text-sm">
        Próximas 8 semanas (segunda a domingo) · total {fmt.dinheiro(total)}. O vencido não pago aparece na semana atual.
      </p>
      <Card>
        <CardContent className="space-y-3 pt-2">
          <div className="flex gap-4 text-xs" aria-label="Legenda">
            <span className="flex items-center gap-1.5">
              <span className="bg-em-dia size-2.5 rounded-sm" aria-hidden /> Em dia
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-atraso size-2.5 rounded-sm" aria-hidden /> Vencido não pago
            </span>
          </div>
          <GraficoFluxo dados={dados} moeda={config.moeda} locale={config.locale} linkBase={base} />
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Semana</TableHead>
            <TableHead className="text-right">Em dia</TableHead>
            <TableHead className="text-right">Vencido</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {semanas.map((s) => (
            <TableRow key={s.inicio}>
              <TableCell>
                {fmt.dataCurta(s.inicio)} – {fmt.dataCurta(s.fim)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <Link className="hover:underline" href={`${base}${base.includes('?') ? '&' : '?'}semana=${s.inicio}&parte=emdia`}>
                  {fmt.dinheiro(s.emDia)}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {s.vencido > 0 ? (
                  <Link className="text-atraso hover:underline" href={`${base}${base.includes('?') ? '&' : '?'}semana=${s.inicio}&parte=vencido`}>
                    {fmt.dinheiro(s.vencido)}
                  </Link>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">{fmt.dinheiro(s.emDia + s.vencido)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
