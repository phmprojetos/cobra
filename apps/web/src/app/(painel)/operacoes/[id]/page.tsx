import Link from 'next/link';
import { notFound } from 'next/navigation';
import { saldoParcela, somarDias } from '@cobra/core';
import { paraParcela } from '@cobra/db';
import { DialogoPagamento } from '@/components/dialogo-pagamento';
import { StatusBadge } from '@/components/status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { carregarPainel } from '@/lib/painel';

const ACOES: Record<string, string> = {
  criar: 'Empréstimo registrado',
  pagamento: 'Pagamento',
  prorrogar: 'Prorrogação',
  renegociar: 'Renegociação',
  perda: 'Marcada como perda',
  cancelar: 'Cancelada',
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
  const aberta = ['ativa', 'atrasada', 'renegociada'].includes(op.status);

  return (
    <>
      <div className="space-y-1">
        <Link href="/operacoes" className="text-muted-foreground text-sm hover:underline">
          ← Operações
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            <Link href={`/clientes/${op.cliente_id}`} className="hover:underline">
              {cliente?.nome}
            </Link>
          </h1>
          <StatusBadge status={op.status} />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Emprestado', fmt.dinheiro(op.valor_principal), fmt.data(op.data_emprestimo)],
          ['A receber', fmt.dinheiro(op.valor_total_receber), `juros ${fmt.dinheiro(op.juros_total)}`],
          ['Taxa efetiva', `${fmt.pct(Number(op.taxa_efetiva_mensal))} a.m.`, `${fmt.pct(Number(op.taxa_periodo))} no período`],
          ['Saldo', fmt.dinheiro(saldo), op.status === 'perdida' ? `prejuízo ${fmt.dinheiro(op.valor_prejuizo)}` : `${op.renegociacoes} renegociação(ões)`],
        ].map(([r, v, d]) => (
          <div key={r} className="rounded-xl border p-3">
            <div className="text-muted-foreground text-xs">{r}</div>
            <div className="text-lg font-semibold tabular-nums">{v}</div>
            <div className="text-muted-foreground text-xs">{d}</div>
          </div>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parcelas</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {parcelas.map((p) => {
                const s = saldoParcela(paraParcela(p)).total;
                const breve = s > 0 && p.vencimento >= hoje && p.vencimento <= somarDias(hoje, 3);
                return (
                  <TableRow key={p.id}>
                    <TableCell>{p.numero}</TableCell>
                    <TableCell>{fmt.data(p.vencimento)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.dinheiro(p.valor)}
                      <div className="text-muted-foreground text-xs">
                        P {fmt.dinheiro(p.valor_principal)} · J {fmt.dinheiro(p.valor_juros)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.dinheiro(p.valor_pago)}</TableCell>
                    <TableCell>
                      <StatusBadge status={breve && p.status !== 'atrasada' ? 'breve' : p.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {aberta && s > 0 && (
                        <DialogoPagamento parcelaId={p.id} cliente={cliente?.nome ?? ''} saldo={s} saldoFormatado={fmt.dinheiro(s)} hoje={hoje} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pagamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {pagamentos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum pagamento.</p>
          ) : (
            <ul className="divide-y text-sm">
              {pagamentos.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 py-2">
                  <span>
                    {fmt.data(p.data)} · parcela {parcelas.find((x) => x.id === p.parcela_id)?.numero}
                    {p.forma ? ` · ${p.forma}` : ''} <span className="text-muted-foreground">({p.origem})</span>
                  </span>
                  <span className="text-right tabular-nums">
                    {fmt.dinheiro(p.valor)}
                    <span className="text-muted-foreground block text-xs">
                      P {fmt.dinheiro(p.valor_principal_alocado)} · J {fmt.dinheiro(p.valor_juros_alocado)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {eventos.map((e) => {
              const pl = e.payload as { antes?: { vencimento: string; valor: number }; depois?: { vencimento: string; valor: number } };
              return (
                <li key={e.id} className="border-l-2 pl-3">
                  <div className="font-medium">{ACOES[e.acao] ?? e.acao}</div>
                  <div className="text-muted-foreground text-xs">{new Date(e.created_at).toLocaleString('pt-BR')}</div>
                  {pl.antes && pl.depois && (
                    <div className="text-xs">
                      {fmt.data(pl.antes.vencimento)} · {fmt.dinheiro(pl.antes.valor)} → {fmt.data(pl.depois.vencimento)} ·{' '}
                      {fmt.dinheiro(pl.depois.valor)}
                    </div>
                  )}
                  {e.mensagem_telegram && <blockquote className="text-muted-foreground mt-1 text-xs italic">“{e.mensagem_telegram}”</blockquote>}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </>
  );
}
