import Link from 'next/link';
import { calcularKpis, listarAtrasados } from '@cobra/core';
import { Cabecalho } from '@/components/cabecalho';
import { DialogoPagamento } from '@/components/dialogo-pagamento';
import { Kpi } from '@/components/kpi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { carregarPainel, comPeriodo, type SearchParams } from '@/lib/painel';

export default async function Inicio({ searchParams }: PageProps<'/'>) {
  const sp = (await searchParams) as SearchParams;
  const { carteira: c, hoje, periodo, fmt } = await carregarPainel(sp);
  const k = calcularKpis(c.carteira, hoje, periodo);
  const atrasados = listarAtrasados(c.carteira, hoje);
  const ops = (filtro: string) => `/operacoes${comPeriodo(sp, { filtro })}`;
  const totalLucro = k.lucroRealizado + k.lucroARealizar;

  return (
    <>
      <Cabecalho titulo="Início" periodo={periodo} />

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Capital na rua" valor={fmt.dinheiro(k.capitalNaRua)} href={ops('capital')} detalhe="principal em aberto" />
        <Kpi rotulo="Total a receber" valor={fmt.dinheiro(k.totalAReceber)} href={ops('areceber')} detalhe="principal + juros" />
        <Kpi rotulo="Próximos 7 dias" valor={fmt.dinheiro(k.aReceber7Dias)} href={ops('7dias')} detalhe="de hoje até +6 dias" />
        <Kpi
          rotulo="Vencido"
          valor={fmt.dinheiro(k.totalVencido)}
          href={ops('vencido')}
          alerta={k.totalVencido > 0}
          detalhe={`${atrasados.length} parcela(s)`}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Lucro no período · {fmt.data(periodo.inicio)} a {fmt.data(periodo.fim)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Link href={ops('lucro_realizado')} className="hover:bg-muted/50 rounded-lg p-2">
              <div className="text-muted-foreground text-xs">Realizado (juros recebidos)</div>
              <div className="text-lg font-semibold tabular-nums">{fmt.dinheiro(k.lucroRealizado)}</div>
            </Link>
            <Link href={ops('lucro_a_realizar')} className="hover:bg-muted/50 rounded-lg p-2">
              <div className="text-muted-foreground text-xs">A realizar (juros a vencer)</div>
              <div className="text-lg font-semibold tabular-nums">{fmt.dinheiro(k.lucroARealizar)}</div>
            </Link>
            {k.prejuizo > 0 && (
              <Link href={ops('prejuizo')} className="hover:bg-muted/50 rounded-lg p-2">
                <div className="text-muted-foreground text-xs">Prejuízo (perdas)</div>
                <div className="text-lg font-semibold tabular-nums">{fmt.dinheiro(k.prejuizo)}</div>
              </Link>
            )}
          </div>
          {totalLucro > 0 && (
            <div aria-hidden className="bg-muted flex h-2 overflow-hidden rounded-full">
              {/* Barra de proporção neutra: realizado sólido, a realizar mais claro */}
              <div className="bg-foreground/70" style={{ width: `${(k.lucroRealizado / totalLucro) * 100}%` }} />
              <div className="bg-foreground/20 ml-0.5 flex-1" />
            </div>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="atrasados" className="space-y-2">
        <h2 id="atrasados" className="font-medium">
          Atrasados <span className="text-muted-foreground text-sm font-normal">· ordenados por valor × dias de atraso</span>
        </h2>
        {atrasados.length === 0 ? (
          <p className="text-muted-foreground text-sm">Ninguém atrasado. ✅</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {atrasados.map((a) => {
              const cliente = c.clientes.get(a.clienteId);
              const parcela = c.parcelas.find((p) => p.id === a.parcelaId)!;
              const total = c.parcelas.filter((p) => p.operacao_id === a.operacaoId).length;
              return (
                <li key={a.parcelaId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <Link href={`/operacoes/${a.operacaoId}`} className="min-w-0 flex-1">
                    <div className="truncate font-medium">{cliente?.nome}</div>
                    <div className="text-muted-foreground text-xs">
                      {total > 1 ? `parcela ${parcela.numero}/${total} · ` : ''}venceu {fmt.data(a.vencimento)} ·{' '}
                      <span className="text-atraso">{a.diasAtraso} dia(s) de atraso</span>
                    </div>
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">{fmt.dinheiro(a.saldo)}</span>
                    <DialogoPagamento
                      parcelaId={a.parcelaId}
                      cliente={cliente?.nome ?? ''}
                      saldo={a.saldo}
                      saldoFormatado={fmt.dinheiro(a.saldo)}
                      hoje={hoje}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
