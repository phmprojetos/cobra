import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Clock, HandCoins, History, RefreshCw, XCircle, Ban, FilePlus2, CalendarClock } from 'lucide-react';
import { diferencaDias, formatarDocumento, saldoParcela, somarDias } from '@cobra/core';
import { paraParcela } from '@cobra/db';
import { DialogoPagamento } from '@/components/dialogo-pagamento';
import { Avatar, BarraProgresso, Dinheiro, Secao, Vazio } from '@/components/painel/ui';
import { StatusBadge } from '@/components/status';
import { carregarPainel } from '@/lib/painel';
import { cn } from '@/lib/utils';

const ACOES: Record<string, { rotulo: string; icone: typeof Clock; cor: string }> = {
  criar: { rotulo: 'Empréstimo registrado', icone: FilePlus2, cor: 'text-em-dia bg-em-dia-fill/12' },
  pagamento: { rotulo: 'Pagamento recebido', icone: HandCoins, cor: 'text-pago bg-pago-fill/12' },
  prorrogar: { rotulo: 'Prorrogação', icone: CalendarClock, cor: 'text-breve bg-breve-fill/14' },
  renegociar: { rotulo: 'Renegociação', icone: RefreshCw, cor: 'text-breve bg-breve-fill/14' },
  renovar: { rotulo: 'Renovação (pagou os juros)', icone: RefreshCw, cor: 'text-pago bg-pago-fill/12' },
  perda: { rotulo: 'Marcada como perda', icone: XCircle, cor: 'text-atraso bg-atraso-fill/12' },
  cancelar: { rotulo: 'Cancelada', icone: Ban, cor: 'text-muted-foreground bg-muted' },
};

export default async function Operacao({ params }: PageProps<'/operacoes/[id]'>) {
  const { id } = await params;
  const { repo, hoje, fmt } = await carregarPainel();
  const c = await repo.carregarCarteira({ operacaoId: id });
  const op = c.operacoes[0];
  if (!op) notFound();
  const cliente = c.clientes.get(op.cliente_id);
  const parcelas = [...c.parcelas].sort((a, b) => a.numero - b.numero);
  const eventos = await repo.eventos([op.id, ...parcelas.map((p) => p.id)]);
  const pagamentos = [...c.pagamentos].sort((a, b) => (a.data < b.data ? 1 : -1));
  const saldo = parcelas.reduce((a, p) => a + saldoParcela(paraParcela(p)).total, 0);
  const recebido = parcelas.reduce((a, p) => a + p.valor_pago, 0);
  const totalPrevisto = parcelas.filter((p) => p.status !== 'cancelada').reduce((a, p) => a + p.valor, 0);
  const jurosRecebidos = pagamentos.reduce((a, p) => a + p.valor_juros_alocado, 0);
  const aberta = ['ativa', 'atrasada', 'renegociada'].includes(op.status);
  const atrasada = op.status === 'atrasada';

  return (
    <>
      <div className="space-y-4">
        <Link href="/operacoes" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-4" /> Operações
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar nome={cliente?.nome ?? '?'} tom={atrasada || op.status === 'perdida' ? 'atraso' : op.status === 'quitada' ? 'pago' : 'em-dia'} />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
              <Link href={`/clientes/${op.cliente_id}`} className="hover:underline">
                {cliente?.nome}
              </Link>
              <StatusBadge status={op.status} />
            </h1>
            <p className="text-muted-foreground text-sm">
              {formatarDocumento(cliente?.documento_tipo ?? null, cliente?.documento ?? null)} · empréstimo de {fmt.data(op.data_emprestimo)} ·{' '}
              {op.tipo === 'unica' ? 'parcela única' : `${parcelas.length} parcelas ${op.periodicidade ?? ''}`}
              {op.renegociacoes > 0 ? ` · ${op.renegociacoes} renegociação(ões)` : ''}
            </p>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { r: 'Emprestado', v: fmt.dinheiro(op.valor_principal), cls: '', d: `taxa ${fmt.pct(Number(op.taxa_efetiva_mensal))} a.m.` },
          { r: 'Total previsto', v: fmt.dinheiro(totalPrevisto), cls: '', d: `juros ${fmt.dinheiro(totalPrevisto - op.valor_principal)}` },
          { r: 'Recebido', v: fmt.dinheiro(recebido), cls: 'text-pago', d: `juros recebidos ${fmt.dinheiro(jurosRecebidos)}` },
          {
            r: op.status === 'perdida' ? 'Prejuízo' : 'Em aberto',
            v: op.status === 'perdida' ? `−${fmt.dinheiro(op.valor_prejuizo)}` : fmt.dinheiro(saldo),
            cls: op.status === 'perdida' || atrasada ? 'text-atraso' : saldo === 0 ? 'text-pago' : '',
            d: saldo === 0 && op.status !== 'perdida' ? 'quitado' : atrasada ? 'com atraso' : 'a receber',
          },
        ].map((x) => (
          <div key={x.r} className="bg-card rounded-xl border p-4 shadow-xs">
            <div className="text-muted-foreground text-sm">{x.r}</div>
            <div className={cn('mt-1 text-xl font-semibold tabular-nums', x.cls)}>{x.v}</div>
            <div className="text-muted-foreground mt-0.5 text-xs">{x.d}</div>
          </div>
        ))}
      </section>

      <div className="bg-card rounded-xl border p-4 shadow-xs">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Quitação do contrato</span>
          <span className="text-muted-foreground tabular-nums">
            <span className="text-pago font-medium">{fmt.dinheiro(recebido)}</span> de {fmt.dinheiro(totalPrevisto)}
          </span>
        </div>
        <BarraProgresso pago={recebido} total={totalPrevisto} atrasado={atrasada} />
      </div>

      <Secao titulo="Parcelas" semPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">#</th>
                <th className="px-3 py-3 font-medium">Vencimento</th>
                <th className="px-3 py-3 text-right font-medium">Valor</th>
                <th className="hidden px-3 py-3 text-right font-medium sm:table-cell">Pago</th>
                <th className="px-3 py-3 text-right font-medium">Em aberto</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {parcelas.map((p) => {
                const s = saldoParcela(paraParcela(p)).total;
                const breve = s > 0 && p.vencimento >= hoje && p.vencimento <= somarDias(hoje, 3);
                const atraso = s > 0 && p.vencimento < hoje ? diferencaDias(p.vencimento, hoje) : 0;
                return (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="text-muted-foreground px-5 py-3 tabular-nums">{p.numero}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={atraso ? 'text-atraso font-medium' : breve ? 'text-breve font-medium' : ''}>{fmt.data(p.vencimento)}</span>
                      {atraso > 0 && <span className="text-atraso block text-xs">{atraso} dia(s) de atraso</span>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {fmt.dinheiro(p.valor)}
                      <span className="text-muted-foreground block text-xs">
                        P {fmt.dinheiro(p.valor_principal)} · J {fmt.dinheiro(p.valor_juros)}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">
                      {p.valor_pago > 0 ? <span className="text-pago font-medium">{fmt.dinheiro(p.valor_pago)}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={cn('px-3 py-3 text-right font-semibold tabular-nums', s === 0 ? 'text-pago' : atraso ? 'text-atraso' : '')}>{s === 0 ? '✓' : fmt.dinheiro(s)}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={breve && p.status !== 'atrasada' ? 'breve' : p.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {aberta && s > 0 && <DialogoPagamento parcelaId={p.id} cliente={cliente?.nome ?? ''} saldo={s} saldoFormatado={fmt.dinheiro(s)} hoje={hoje} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Secao>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Secao
          titulo={
            <span className="flex items-center gap-2">
              <HandCoins className="text-pago size-4" aria-hidden /> Pagamentos
            </span>
          }
          descricao={`${pagamentos.length} pagamento(s) · ${fmt.dinheiro(recebido)}`}
          semPadding
        >
          {pagamentos.length === 0 ? (
            <Vazio icone={HandCoins} titulo="Nenhum pagamento ainda" />
          ) : (
            <ul className="divide-y">
              {pagamentos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="flex items-center gap-3">
                    <span className="bg-pago-fill/12 text-pago flex size-8 items-center justify-center rounded-full">
                      <CheckCircle2 className="size-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-medium">{fmt.data(p.data)}</span>
                      <span className="text-muted-foreground text-xs">
                        parcela {parcelas.find((x) => x.id === p.parcela_id)?.numero}
                        {p.forma ? ` · ${p.forma}` : ''} · {p.origem === 'web' ? 'painel' : 'Telegram'}
                      </span>
                    </span>
                  </span>
                  <span className="text-right">
                    <Dinheiro centavos={p.valor} texto={fmt.dinheiro(p.valor)} tom="pago" sinal className="font-semibold" />
                    <span className="text-muted-foreground block text-xs">
                      P {fmt.dinheiro(p.valor_principal_alocado)} · J {fmt.dinheiro(p.valor_juros_alocado)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao
          titulo={
            <span className="flex items-center gap-2">
              <History className="text-muted-foreground size-4" aria-hidden /> Histórico
            </span>
          }
        >
          <ol className="relative space-y-5 border-l pl-6">
            {eventos.map((e) => {
              const a = ACOES[e.acao] ?? { rotulo: e.acao, icone: Clock, cor: 'text-muted-foreground bg-muted' };
              const Icone = a.icone;
              const pl = e.payload as {
                antes?: { vencimento: string; valor: number };
                depois?: { vencimento: string; valor: number };
                pagamento?: { valor: number; juros: number; principal: number };
                nova?: { vencimento: string; valor: number };
              };
              return (
                <li key={e.id} className="relative text-sm">
                  <span className={cn('absolute top-0 -left-[37px] flex size-6 items-center justify-center rounded-full ring-4 ring-card', a.cor)}>
                    <Icone className="size-3.5" aria-hidden />
                  </span>
                  <div className="font-medium">{a.rotulo}</div>
                  <div className="text-muted-foreground text-xs">{new Date(e.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>
                  {pl.antes && pl.depois && (
                    <div className="mt-1 text-xs">
                      {fmt.data(pl.antes.vencimento)} · {fmt.dinheiro(pl.antes.valor)} → <b>{fmt.data(pl.depois.vencimento)}</b> · <b>{fmt.dinheiro(pl.depois.valor)}</b>
                    </div>
                  )}
                  {e.acao === 'renovar' && pl.pagamento && pl.nova && (
                    <div className="mt-1 text-xs">
                      Pagou <span className="text-pago font-medium">{fmt.dinheiro(pl.pagamento.valor)}</span> (juros {fmt.dinheiro(pl.pagamento.juros)}
                      {pl.pagamento.principal ? `, amortizou ${fmt.dinheiro(pl.pagamento.principal)}` : ''}) → próximo vencimento {fmt.data(pl.nova.vencimento)} ·{' '}
                      {fmt.dinheiro(pl.nova.valor)}
                    </div>
                  )}
                  {e.mensagem_telegram && <blockquote className="text-muted-foreground bg-muted/60 mt-1.5 rounded-md px-2 py-1 text-xs italic">“{e.mensagem_telegram}”</blockquote>}
                </li>
              );
            })}
          </ol>
        </Secao>
      </div>
    </>
  );
}
