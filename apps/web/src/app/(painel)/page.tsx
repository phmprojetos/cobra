import Link from 'next/link';
import { AlertTriangle, ArrowDownLeft, CalendarClock, CheckCircle2, CircleDollarSign, HandCoins, Landmark, TrendingUp, Wallet } from 'lucide-react';
import { calcularKpis, dentroDoPeriodo, diferencaDias, listarAtrasados, saldoParcela, somarDias } from '@cobra/core';
import { Cabecalho } from '@/components/cabecalho';
import { DialogoPagamento } from '@/components/dialogo-pagamento';
import { Avatar, BarraComposicao, Dinheiro, KpiCard, LinkAcao, Secao, Vazio } from '@/components/painel/ui';
import { carregarPainel, comPeriodo, type SearchParams } from '@/lib/painel';

export default async function Inicio({ searchParams }: PageProps<'/'>) {
  const sp = (await searchParams) as SearchParams;
  const { carteira: c, hoje, periodo, fmt } = await carregarPainel(sp);
  const k = calcularKpis(c.carteira, hoje, periodo);
  const ops = (filtro: string) => `/operacoes${comPeriodo(sp, { filtro })}`;
  const em7 = somarDias(hoje, 6);

  // Parcelas em aberto (de operações em aberto) com nome do cliente
  const abertasOp = new Set(c.operacoes.filter((o) => ['ativa', 'atrasada', 'renegociada'].includes(o.status)).map((o) => o.id));
  const nomeDaOp = (opId: string) => c.clientes.get(c.operacoes.find((o) => o.id === opId)?.cliente_id ?? '')?.nome ?? '?';
  const abertas = c.carteira.parcelas
    .filter((p) => abertasOp.has(p.operacaoId))
    .map((p) => ({ p, saldo: saldoParcela(p).total }))
    .filter((x) => x.saldo > 0);
  const soma = (xs: { saldo: number }[]) => xs.reduce((a, x) => a + x.saldo, 0);
  const vencidas = abertas.filter((x) => x.p.vencimento < hoje);
  const proximas = abertas.filter((x) => x.p.vencimento >= hoje && x.p.vencimento <= em7).sort((a, b) => (a.p.vencimento < b.p.vencimento ? -1 : 1));
  const emDia = abertas.filter((x) => x.p.vencimento > em7);

  const atrasados = listarAtrasados(c.carteira, hoje);
  const pagsPeriodo = c.pagamentos.filter((p) => dentroDoPeriodo(p.data, periodo.inicio, periodo.fim));
  const recebido = pagsPeriodo.reduce((a, p) => a + p.valor, 0);
  const resultado = k.lucroRealizado - k.prejuizo;
  const ultimos = [...c.pagamentos].sort((a, b) => (a.data === b.data ? (a.created_at < b.created_at ? 1 : -1) : a.data < b.data ? 1 : -1)).slice(0, 6);
  const opDaParcela = new Map(c.parcelas.map((p) => [p.id, p.operacao_id]));

  return (
    <>
      <Cabecalho titulo="Visão geral" subtitulo={`Carteira em ${fmt.data(hoje)} · período ${fmt.data(periodo.inicio)} a ${fmt.data(periodo.fim)}`} periodo={periodo} />

      <section aria-label="Indicadores" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard rotulo="Capital na rua" valor={fmt.dinheiro(k.capitalNaRua)} href={ops('capital')} icone={Landmark} tom="em-dia" detalhe="principal emprestado em aberto" />
        <KpiCard rotulo="Total a receber" valor={fmt.dinheiro(k.totalAReceber)} href={ops('areceber')} icone={Wallet} tom="neutro" detalhe={`${abertas.length} parcela(s) em aberto`} />
        <KpiCard rotulo="Recebido no período" valor={fmt.dinheiro(recebido)} href={ops('lucro_realizado')} icone={ArrowDownLeft} tom="pago" corValor detalhe={`${pagsPeriodo.length} pagamento(s)`} />
        <KpiCard
          rotulo="Vencido"
          valor={fmt.dinheiro(k.totalVencido)}
          href={ops('vencido')}
          icone={AlertTriangle}
          tom={k.totalVencido > 0 ? 'atraso' : 'pago'}
          corValor
          detalhe={k.totalVencido > 0 ? `${atrasados.length} parcela(s) em atraso` : 'nenhum atraso'}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Secao className="xl:col-span-2" titulo="Saúde da carteira" descricao={`Total a receber: ${fmt.dinheiro(k.totalAReceber)}`}>
          <BarraComposicao
            segmentos={[
              { rotulo: 'Em dia', valor: soma(emDia), valorFmt: fmt.dinheiro(soma(emDia)), tom: 'em-dia', href: ops('areceber') },
              { rotulo: 'Vence em 7 dias', valor: soma(proximas), valorFmt: fmt.dinheiro(soma(proximas)), tom: 'breve', href: ops('7dias') },
              { rotulo: 'Atrasado', valor: soma(vencidas), valorFmt: fmt.dinheiro(soma(vencidas)), tom: 'atraso', href: ops('vencido') },
            ]}
          />
        </Secao>

        <Secao titulo="Resultado do período" descricao="Juros recebidos menos perdas">
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground flex items-center gap-2">
                <TrendingUp className="text-pago size-4" aria-hidden /> Lucro realizado
              </dt>
              <dd>
                <Link href={ops('lucro_realizado')} className="font-semibold hover:underline">
                  <Dinheiro centavos={k.lucroRealizado} texto={fmt.dinheiro(k.lucroRealizado)} tom="pago" sinal />
                </Link>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground flex items-center gap-2">
                <CircleDollarSign className="text-em-dia size-4" aria-hidden /> A realizar no período
              </dt>
              <dd>
                <Link href={ops('lucro_a_realizar')} className="font-semibold hover:underline">
                  <Dinheiro centavos={k.lucroARealizar} texto={fmt.dinheiro(k.lucroARealizar)} tom="em-dia" />
                </Link>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="text-atraso size-4" aria-hidden /> Perdas
              </dt>
              <dd>
                <Link href={ops('prejuizo')} className="font-semibold hover:underline">
                  <Dinheiro centavos={-k.prejuizo} texto={k.prejuizo ? `−${fmt.dinheiro(k.prejuizo)}` : fmt.dinheiro(0)} tom={k.prejuizo ? 'atraso' : 'neutro'} />
                </Link>
              </dd>
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <dt className="font-medium">Resultado</dt>
              <dd className="text-lg font-semibold">
                <Dinheiro centavos={resultado} texto={`${resultado < 0 ? '−' : resultado > 0 ? '+' : ''}${fmt.dinheiro(Math.abs(resultado))}`} tom={resultado < 0 ? 'atraso' : resultado > 0 ? 'pago' : 'neutro'} />
              </dd>
            </div>
          </dl>
        </Secao>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Secao
          titulo={
            <span className="flex items-center gap-2">
              <AlertTriangle className="text-atraso size-4" aria-hidden /> Devedores em atraso
            </span>
          }
          descricao="Ordenados por valor × dias de atraso"
          acao={atrasados.length > 0 ? <LinkAcao href={ops('vencido')}>Ver todos</LinkAcao> : undefined}
          semPadding
        >
          {atrasados.length === 0 ? (
            <Vazio icone={CheckCircle2} titulo="Ninguém atrasado" texto="Todos os contratos estão em dia." />
          ) : (
            <ul className="divide-y">
              {atrasados.slice(0, 8).map((a) => {
                const cliente = c.clientes.get(a.clienteId);
                const parcela = c.parcelas.find((p) => p.id === a.parcelaId)!;
                const total = c.parcelas.filter((p) => p.operacao_id === a.operacaoId).length;
                return (
                  <li key={a.parcelaId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <Avatar nome={cliente?.nome ?? '?'} tom="atraso" />
                    <Link href={`/operacoes/${a.operacaoId}`} className="min-w-0 flex-1">
                      <div className="truncate font-medium">{cliente?.nome}</div>
                      <div className="text-muted-foreground text-xs">
                        {total > 1 ? `parcela ${parcela.numero}/${total} · ` : ''}venceu {fmt.dataCurta(a.vencimento)}
                      </div>
                    </Link>
                    <div className="text-right">
                      <div className="text-atraso font-semibold tabular-nums">{fmt.dinheiro(a.saldo)}</div>
                      <div className="text-atraso text-xs font-medium">{a.diasAtraso} dia(s)</div>
                    </div>
                    <DialogoPagamento parcelaId={a.parcelaId} cliente={cliente?.nome ?? ''} saldo={a.saldo} saldoFormatado={fmt.dinheiro(a.saldo)} hoje={hoje} />
                  </li>
                );
              })}
            </ul>
          )}
        </Secao>

        <Secao
          titulo={
            <span className="flex items-center gap-2">
              <CalendarClock className="text-breve size-4" aria-hidden /> Vencem nos próximos 7 dias
            </span>
          }
          descricao={`${fmt.dataCurta(hoje)} a ${fmt.dataCurta(em7)} · ${fmt.dinheiro(soma(proximas))}`}
          acao={proximas.length > 0 ? <LinkAcao href={ops('7dias')}>Ver todos</LinkAcao> : undefined}
          semPadding
        >
          {proximas.length === 0 ? (
            <Vazio icone={CalendarClock} titulo="Nada vence nesta semana" />
          ) : (
            <ul className="divide-y">
              {proximas.slice(0, 8).map(({ p, saldo }) => {
                const dias = diferencaDias(hoje, p.vencimento);
                return (
                  <li key={p.id}>
                    <Link href={`/operacoes/${p.operacaoId}`} className="hover:bg-muted/50 flex items-center gap-3 px-5 py-3 transition-colors">
                      <Avatar nome={nomeDaOp(p.operacaoId)} tom="breve" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{nomeDaOp(p.operacaoId)}</div>
                        <div className="text-muted-foreground text-xs">{fmt.data(p.vencimento)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">{fmt.dinheiro(saldo)}</div>
                        <div className="text-breve text-xs font-medium">{dias === 0 ? 'vence hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`}</div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Secao>
      </div>

      <Secao
        titulo={
          <span className="flex items-center gap-2">
            <HandCoins className="text-pago size-4" aria-hidden /> Últimos recebimentos
          </span>
        }
        semPadding
      >
        {ultimos.length === 0 ? (
          <Vazio icone={HandCoins} titulo="Nenhum recebimento ainda" />
        ) : (
          <ul className="divide-y">
            {ultimos.map((pg) => {
              const opId = opDaParcela.get(pg.parcela_id)!;
              return (
                <li key={pg.id}>
                  <Link href={`/operacoes/${opId}`} className="hover:bg-muted/50 flex items-center gap-3 px-5 py-3 transition-colors">
                    <Avatar nome={nomeDaOp(opId)} tom="pago" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{nomeDaOp(opId)}</div>
                      <div className="text-muted-foreground text-xs">
                        {fmt.data(pg.data)}
                        {pg.forma ? ` · ${pg.forma}` : ''} · {pg.origem === 'web' ? 'painel' : 'Telegram'}
                      </div>
                    </div>
                    <div className="text-right">
                      <Dinheiro centavos={pg.valor} texto={fmt.dinheiro(pg.valor)} tom="pago" sinal className="font-semibold" />
                      <div className="text-muted-foreground text-xs">juros {fmt.dinheiro(pg.valor_juros_alocado)}</div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>
    </>
  );
}
