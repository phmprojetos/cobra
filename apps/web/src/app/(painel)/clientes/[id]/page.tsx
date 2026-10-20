import Link from 'next/link';
import { notFound } from 'next/navigation';
import { metricasCliente } from '@cobra/core';
import { StatusBadge } from '@/components/status';
import { carregarPainel, saldoOperacao } from '@/lib/painel';

export default async function Cliente({ params }: PageProps<'/clientes/[id]'>) {
  const { id } = await params;
  const { repo, hoje, fmt } = await carregarPainel();
  const c = await repo.carregarCarteira({ clienteId: id });
  const cliente = c.clientes.get(id);
  if (!cliente) notFound();
  const m = metricasCliente(c.carteira, id, hoje);
  const ops = `/operacoes?cliente=${id}&p=tudo`;

  const cards: [string, string, string?][] = [
    ['Saldo atual', fmt.dinheiro(m.saldoAtual), `${m.operacoesEmAberto} em aberto`],
    ['Total emprestado', fmt.dinheiro(m.totalEmprestado), `${m.operacoes} operação(ões)`],
    ['Pago em dia', m.percentualPagoEmDia === null ? '—' : fmt.pct(m.percentualPagoEmDia), 'das parcelas vencidas ou pagas'],
    ['Atraso médio', m.atrasoMedioDias === null ? '—' : `${m.atrasoMedioDias.toFixed(1)} dias`, `${m.renegociacoes} renegociação(ões)`],
  ];

  return (
    <>
      <div className="space-y-1">
        <Link href="/clientes" className="text-muted-foreground text-sm hover:underline">
          ← Clientes
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{cliente.nome}</h1>
        <p className="text-muted-foreground text-sm">
          {[cliente.apelidos.length ? `apelidos: ${cliente.apelidos.join(', ')}` : null, cliente.telefone, cliente.observacoes]
            .filter(Boolean)
            .join(' · ') || 'Sem observações'}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(([r, v, d]) => (
          <Link key={r} href={ops} className="hover:bg-muted/50 rounded-xl border p-3">
            <div className="text-muted-foreground text-xs">{r}</div>
            <div className="text-lg font-semibold tabular-nums">{v}</div>
            {d && <div className="text-muted-foreground text-xs">{d}</div>}
          </Link>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Operações</h2>
        {c.operacoes.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma operação.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {c.operacoes.map((o) => (
              <li key={o.id}>
                <Link href={`/operacoes/${o.id}`} className="hover:bg-muted/50 flex flex-wrap items-center gap-3 p-3">
                  <span className="min-w-0 flex-1 text-sm">
                    {fmt.data(o.data_emprestimo)} · {fmt.dinheiro(o.valor_principal)} → {fmt.dinheiro(o.valor_total_receber)}
                  </span>
                  <StatusBadge status={o.status} />
                  <span className="w-28 text-right font-semibold tabular-nums">{fmt.dinheiro(saldoOperacao(c, o.id))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
