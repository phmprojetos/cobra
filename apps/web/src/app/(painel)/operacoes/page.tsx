import Link from 'next/link';
import { Cabecalho } from '@/components/cabecalho';
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
import { somarDias } from '@cobra/core';

const STATUS = ['ativa', 'atrasada', 'renegociada', 'quitada', 'perdida'] as const;

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
  const totalSaldo = lista.reduce((a, o) => a + saldoOperacao(c, o.id), 0);
  const clientes = [...c.clientes.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  const titulo = semana
    ? `${parte === 'vencido' ? 'Vencido não pago' : 'A receber'} · semana de ${fmt.dataCurta(semana)}`
    : filtro && filtro in FILTROS
      ? FILTROS[filtro]
      : 'Empréstimos do período';

  return (
    <>
      <Cabecalho titulo="Operações" periodo={periodo} />
      <form className="flex flex-wrap items-end gap-2 text-sm" action="/operacoes">
        {['p', 'de', 'ate', 'filtro', 'semana', 'parte'].map((k) => {
          const v = param(sp, k);
          return v ? <input key={k} type="hidden" name={k} value={v} /> : null;
        })}
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Status</span>
          <select name="status" defaultValue={status ?? ''} className="bg-background h-8 rounded-md border px-2">
            <option value="">Todos</option>
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Cliente</span>
          <select name="cliente" defaultValue={clienteId ?? ''} className="bg-background h-8 max-w-48 rounded-md border px-2">
            <option value="">Todos</option>
            {clientes.map((cl) => (
              <option key={cl.id} value={cl.id}>
                {cl.nome}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" variant="outline">
          Filtrar
        </Button>
        {(filtro || status || clienteId || semana) && (
          <Link href={`/operacoes${comPeriodo(sp, {})}`} className="text-muted-foreground px-2 py-1.5 text-xs hover:underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">{titulo}</h2>
        <span className="text-muted-foreground text-sm">
          {lista.length} operação(ões) · saldo {fmt.dinheiro(totalSaldo)}
        </span>
      </div>

      {lista.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma operação encontrada.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {lista.map((o) => {
            const venc = proximoVencimento(c, o.id);
            const breve = venc && venc >= hoje && venc <= somarDias(hoje, 3);
            return (
              <li key={o.id}>
                <Link href={`/operacoes/${o.id}`} className="hover:bg-muted/50 flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.clientes.get(o.cliente_id)?.nome}</div>
                    <div className="text-muted-foreground text-xs">
                      {fmt.data(o.data_emprestimo)} · {fmt.dinheiro(o.valor_principal)} → {fmt.dinheiro(o.valor_total_receber)} ·{' '}
                      {fmt.pct(Number(o.taxa_efetiva_mensal))} a.m.
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {venc && (
                      <span className="text-muted-foreground text-xs">
                        próx. {fmt.dataCurta(venc)}
                      </span>
                    )}
                    <StatusBadge status={o.status === 'ativa' && breve ? 'breve' : o.status} />
                    <span className="w-28 text-right font-semibold tabular-nums">{fmt.dinheiro(saldoOperacao(c, o.id))}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
