import Link from 'next/link';
import { metricasCliente } from '@cobra/core';
import { Cabecalho } from '@/components/cabecalho';
import { carregarPainel, param, type SearchParams } from '@/lib/painel';

export default async function Clientes({ searchParams }: PageProps<'/clientes'>) {
  const sp = (await searchParams) as SearchParams;
  const { carteira: c, hoje, fmt } = await carregarPainel(sp);
  const busca = (param(sp, 'q') ?? '').trim().toLowerCase();
  const linhas = [...c.clientes.values()]
    .filter((cl) => cl.ativo || c.operacoes.some((o) => o.cliente_id === cl.id))
    .filter((cl) => !busca || cl.nome.toLowerCase().includes(busca) || cl.apelidos.some((a) => a.toLowerCase().includes(busca)))
    .map((cl) => ({ cl, m: metricasCliente(c.carteira, cl.id, hoje) }))
    .sort((a, b) => b.m.saldoAtual - a.m.saldoAtual || a.cl.nome.localeCompare(b.cl.nome));

  return (
    <>
      <Cabecalho titulo="Clientes">
        <form action="/clientes">
          <input
            name="q"
            defaultValue={busca}
            placeholder="Buscar…"
            className="bg-background h-8 w-40 rounded-md border px-2 text-sm"
            aria-label="Buscar cliente"
          />
        </form>
      </Cabecalho>
      <p className="text-muted-foreground text-sm">Novos clientes são cadastrados pelo Telegram.</p>
      <ul className="divide-y rounded-xl border">
        {linhas.map(({ cl, m }) => (
          <li key={cl.id}>
            <Link href={`/clientes/${cl.id}`} className="hover:bg-muted/50 flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {cl.nome}
                  {cl.apelidos.length > 0 && <span className="text-muted-foreground font-normal"> · {cl.apelidos.join(', ')}</span>}
                </div>
                <div className="text-muted-foreground text-xs">
                  {m.operacoes} operação(ões) · pontualidade {m.percentualPagoEmDia === null ? '—' : fmt.pct(m.percentualPagoEmDia)}
                </div>
              </div>
              <span className="font-semibold tabular-nums">{fmt.dinheiro(m.saldoAtual)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
