import Link from 'next/link';
import { FileText, X } from 'lucide-react';
import { saldoParcela, somarDias } from '@cobra/core';
import { Cabecalho } from '@/components/cabecalho';
import { Avatar, BarraProgresso, Secao, Vazio } from '@/components/painel/ui';
import { StatusBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import {
  carregarPainel,
  comPeriodo,
  filtrarOperacoes,
  FILTROS,
  param,
  proximoVencimento,
  saldoOperacao,
  type Filtro,
  type SearchParams,
} from '@/lib/painel';

const STATUS: [string, string][] = [
  ['ativa', 'Em dia'],
  ['atrasada', 'Atrasada'],
  ['renegociada', 'Renegociada'],
  ['quitada', 'Quitada'],
  ['perdida', 'Perdida'],
];

const selectCls = 'bg-card h-9 rounded-lg border px-2.5 text-sm shadow-xs';

export default async function Operacoes({ searchParams }: PageProps<'/operacoes'>) {
  const sp = (await searchParams) as SearchParams;
  const { carteira: c, hoje, periodo, fmt } = await carregarPainel(sp);
  const filtro = param(sp, 'filtro') as Filtro | undefined;
  const status = param(sp, 'status');
  const clienteId = param(sp, 'cliente');
  const semana = param(sp, 'semana');
  const parte = param(sp, 'parte') as 'emdia' | 'vencido' | undefined;
  const lista = filtrarOperacoes(c, hoje, periodo, {
    ...(filtro && filtro in FILTROS ? { filtro } : {}),
    ...(status ? { status } : {}),
    ...(clienteId ? { clienteId } : {}),
    ...(semana ? { semana, parte: parte ?? 'emdia' } : {}),
    // Sem filtro de drill-down: lista os empréstimos feitos no período global.
    ...(!filtro && !semana && !clienteId ? { periodoEmprestimo: periodo } : {}),
  });
  const pagoDaOp = (opId: string) => c.carteira.parcelas.filter((p) => p.operacaoId === opId).reduce((a, p) => a + p.valorPago, 0);
  const totalSaldo = lista.reduce((a, o) => a + saldoOperacao(c, o.id), 0);
  const totalPago = lista.reduce((a, o) => a + pagoDaOp(o.id), 0);
  const totalEmprestado = lista.reduce((a, o) => a + o.valor_principal, 0);
  const totalVencido = lista.reduce(
    (a, o) => a + c.carteira.parcelas.filter((p) => p.operacaoId === o.id && p.vencimento < hoje).reduce((s, p) => s + saldoParcela(p).total, 0),
    0,
  );
  const clientes = [...c.clientes.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  const titulo = semana
    ? `${parte === 'vencido' ? 'Vencido não pago' : 'A receber'} · semana de ${fmt.dataCurta(semana)}`
    : filtro && filtro in FILTROS
      ? FILTROS[filtro]
      : 'Empréstimos feitos no período';
  const temFiltro = !!(filtro || status || clienteId || semana);

  return (
    <>
      <Cabecalho titulo="Operações" subtitulo="Todos os contratos de empréstimo" periodo={periodo} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Emprestado', fmt.dinheiro(totalEmprestado), 'text-foreground'],
          ['Recebido', fmt.dinheiro(totalPago), 'text-pago'],
          ['Em aberto', fmt.dinheiro(totalSaldo), 'text-foreground'],
          ['Vencido', fmt.dinheiro(totalVencido), totalVencido > 0 ? 'text-atraso' : 'text-pago'],
        ].map(([r, v, cls]) => (
          <div key={r} className="bg-card rounded-xl border p-4 shadow-xs">
            <div className="text-muted-foreground text-sm">{r}</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>{v}</div>
          </div>
        ))}
      </div>

      <Secao
        titulo={titulo}
        descricao={`${lista.length} operação(ões)`}
        semPadding
        acao={
          <form className="flex flex-wrap items-center gap-2" action="/operacoes">
            {['p', 'de', 'ate', 'filtro', 'semana', 'parte'].map((k) => {
              const v = param(sp, k);
              return v ? <input key={k} type="hidden" name={k} value={v} /> : null;
            })}
            <select name="status" defaultValue={status ?? ''} className={selectCls} aria-label="Status">
              <option value="">Todos os status</option>
              {STATUS.map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
            <select name="cliente" defaultValue={clienteId ?? ''} className={`${selectCls} max-w-48`} aria-label="Cliente">
              <option value="">Todos os clientes</option>
              {clientes.map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.nome}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline" className="h-9">
              Filtrar
            </Button>
            {temFiltro && (
              <Link href={`/operacoes${comPeriodo(sp, {})}`} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs">
                <X className="size-3.5" /> Limpar
              </Link>
            )}
          </form>
        }
      >
        {lista.length === 0 ? (
          <Vazio icone={FileText} titulo="Nenhuma operação encontrada" texto="Ajuste os filtros ou o período." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Empréstimo</th>
                  <th className="hidden px-3 py-3 font-medium lg:table-cell">Taxa</th>
                  <th className="hidden w-40 px-3 py-3 font-medium sm:table-cell">Quitação</th>
                  <th className="px-3 py-3 font-medium">Próx. venc.</th>
                  <th className="px-3 py-3 text-right font-medium">Em aberto</th>
                  <th className="px-5 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lista.map((o) => {
                  const venc = proximoVencimento(c, o.id);
                  const saldo = saldoOperacao(c, o.id);
                  const atrasada = o.status === 'atrasada';
                  const breve = !!venc && venc >= hoje && venc <= somarDias(hoje, 3);
                  const nome = c.clientes.get(o.cliente_id)?.nome ?? '?';
                  const total = c.carteira.parcelas.filter((p) => p.operacaoId === o.id && p.status !== 'cancelada').reduce((a, p) => a + p.valor, 0);
                  const nParc = c.parcelas.filter((p) => p.operacao_id === o.id).length;
                  const abertas = c.carteira.parcelas.filter((p) => p.operacaoId === o.id && saldoParcela(p).total > 0).length;
                  return (
                    <tr key={o.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/operacoes/${o.id}`} className="flex items-center gap-3">
                          <Avatar nome={nome} tom={atrasada ? 'atraso' : o.status === 'quitada' ? 'pago' : 'neutro'} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium hover:underline">{nome}</span>
                            <span className="text-muted-foreground block text-xs">
                              {fmt.data(o.data_emprestimo)}
                              {nParc > 1 ? ` · ${nParc}x` : ''}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="hidden px-3 py-3 tabular-nums md:table-cell">
                        {fmt.dinheiro(o.valor_principal)} <span className="text-muted-foreground">→</span> {fmt.dinheiro(o.valor_total_receber)}
                      </td>
                      <td className="text-muted-foreground hidden px-3 py-3 tabular-nums lg:table-cell">{fmt.pct(Number(o.taxa_efetiva_mensal))} a.m.</td>
                      <td className="hidden px-3 py-3 sm:table-cell">
                        <BarraProgresso pago={pagoDaOp(o.id)} total={total} atrasado={atrasada} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {venc ? (
                          <span className={atrasada ? 'text-atraso font-medium' : breve ? 'text-breve font-medium' : ''}>{fmt.dataCurta(venc)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {abertas > 1 && <span className="text-muted-foreground block text-xs">{abertas} em aberto</span>}
                      </td>
                      <td className={`px-3 py-3 text-right font-semibold tabular-nums ${saldo === 0 ? 'text-pago' : atrasada ? 'text-atraso' : ''}`}>{fmt.dinheiro(saldo)}</td>
                      <td className="px-5 py-3 text-right">
                        <StatusBadge status={o.status === 'ativa' && breve ? 'breve' : o.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </>
  );
}
