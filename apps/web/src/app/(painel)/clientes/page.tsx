import Link from 'next/link';
import { Search, Users } from 'lucide-react';
import { formatarDocumento, metricasCliente } from '@cobra/core';
import { Cabecalho } from '@/components/cabecalho';
import { Avatar, Secao, tomPontualidade, Vazio, type Tom } from '@/components/painel/ui';
import { carregarPainel, param, type SearchParams } from '@/lib/painel';
import { cn } from '@/lib/utils';

const PILL: Record<Tom, string> = {
  pago: 'text-pago bg-pago-fill/12',
  breve: 'text-breve bg-breve-fill/14',
  atraso: 'text-atraso bg-atraso-fill/12',
  'em-dia': 'text-em-dia bg-em-dia-fill/12',
  neutro: 'text-muted-foreground bg-muted',
};

export default async function Clientes({ searchParams }: PageProps<'/clientes'>) {
  const sp = (await searchParams) as SearchParams;
  const { carteira: c, hoje, fmt } = await carregarPainel(sp);
  const busca = (param(sp, 'q') ?? '').trim().toLowerCase();
  const buscaDoc = busca.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const atrasadosPorCliente = new Set(c.operacoes.filter((o) => o.status === 'atrasada').map((o) => o.cliente_id));
  const linhas = [...c.clientes.values()]
    .filter((cl) => cl.ativo || c.operacoes.some((o) => o.cliente_id === cl.id))
    .filter(
      (cl) =>
        !busca ||
        cl.nome.toLowerCase().includes(busca) ||
        cl.apelidos.some((a) => a.toLowerCase().includes(busca)) ||
        (buscaDoc.length >= 3 && !!cl.documento?.includes(buscaDoc)),
    )
    .map((cl) => ({ cl, m: metricasCliente(c.carteira, cl.id, hoje), atrasado: atrasadosPorCliente.has(cl.id) }))
    .sort((a, b) => Number(b.atrasado) - Number(a.atrasado) || b.m.saldoAtual - a.m.saldoAtual || a.cl.nome.localeCompare(b.cl.nome));
  const devendo = linhas.filter((l) => l.m.saldoAtual > 0).length;

  return (
    <>
      <Cabecalho titulo="Clientes" subtitulo={`${linhas.length} cliente(s) · ${devendo} com saldo em aberto · ${atrasadosPorCliente.size} em atraso`}>
        <form action="/clientes" className="bg-card flex items-center gap-2 rounded-lg border px-3 shadow-xs">
          <Search className="text-muted-foreground size-4" aria-hidden />
          <input name="q" defaultValue={busca} placeholder="Nome ou documento…" className="h-9 w-52 bg-transparent text-sm outline-none" aria-label="Buscar cliente" />
        </form>
      </Cabecalho>

      <Secao titulo="Carteira de clientes" descricao="Novos clientes são cadastrados pelo Telegram, com nome e documento." semPadding>
        {linhas.length === 0 ? (
          <Vazio icone={Users} titulo="Nenhum cliente encontrado" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Documento</th>
                  <th className="hidden px-3 py-3 text-right font-medium lg:table-cell">Emprestado</th>
                  <th className="hidden px-3 py-3 text-right font-medium lg:table-cell">Recebido</th>
                  <th className="px-3 py-3 text-center font-medium">Pontualidade</th>
                  <th className="px-5 py-3 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linhas.map(({ cl, m, atrasado }) => (
                  <tr key={cl.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/clientes/${cl.id}`} className="flex items-center gap-3">
                        <Avatar nome={cl.nome} tom={atrasado ? 'atraso' : m.saldoAtual > 0 ? 'em-dia' : 'pago'} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium hover:underline">{cl.nome}</span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {cl.apelidos.length ? cl.apelidos.join(', ') + ' · ' : ''}
                            {m.operacoesEmAberto} contrato(s) em aberto
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="text-muted-foreground hidden px-3 py-3 font-mono text-xs md:table-cell">{formatarDocumento(cl.documento_tipo, cl.documento)}</td>
                    <td className="hidden px-3 py-3 text-right tabular-nums lg:table-cell">{fmt.dinheiro(m.totalEmprestado)}</td>
                    <td className="text-pago hidden px-3 py-3 text-right tabular-nums lg:table-cell">{fmt.dinheiro(m.totalRecebido)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums', PILL[tomPontualidade(m.percentualPagoEmDia)])}>
                        {m.percentualPagoEmDia === null ? '—' : fmt.pct(m.percentualPagoEmDia)}
                      </span>
                    </td>
                    <td className={cn('px-5 py-3 text-right font-semibold tabular-nums', atrasado ? 'text-atraso' : m.saldoAtual === 0 ? 'text-pago' : '')}>
                      {fmt.dinheiro(m.saldoAtual)}
                      {atrasado && <span className="block text-xs font-medium">em atraso</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </>
  );
}
