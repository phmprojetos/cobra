import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Banknote, CalendarX2, CheckCircle2, FileText, Gauge, HandCoins, Pencil, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatarDocumento, metricasCliente } from '@cobra/core';
import { Avatar, BarraProgresso, KpiCard, Secao, tomPontualidade, Vazio } from '@/components/painel/ui';
import { StatusBadge } from '@/components/status';
import { carregarPainel, saldoOperacao } from '@/lib/painel';
import { cn } from '@/lib/utils';

export default async function Cliente({ params, searchParams }: PageProps<'/clientes/[id]'>) {
  const { id } = await params;
  const { criado, salvo } = await searchParams;
  const { repo, hoje, fmt } = await carregarPainel();
  const c = await repo.carregarCarteira({ clienteId: id });
  const cliente = c.clientes.get(id);
  if (!cliente) notFound();
  const m = metricasCliente(c.carteira, id, hoje);
  const ops = `/operacoes?cliente=${id}&p=tudo`;
  const atrasado = c.operacoes.some((o) => o.status === 'atrasada');
  const pont = tomPontualidade(m.percentualPagoEmDia);

  return (
    <>
      <div className="space-y-4">
        <Link href="/clientes" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-4" /> Clientes
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar nome={cliente.nome} tom={atrasado ? 'atraso' : m.saldoAtual > 0 ? 'em-dia' : 'pago'} />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
              {cliente.nome}
              {atrasado && <StatusBadge status="atrasada" />}
            </h1>
            <p className="text-muted-foreground text-sm">
              {[formatarDocumento(cliente.documento_tipo, cliente.documento), cliente.apelidos.length ? `apelidos: ${cliente.apelidos.join(', ')}` : null, cliente.telefone, cliente.observacoes]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <Button nativeButton={false} variant="outline" render={<Link href={`/clientes/${id}/editar`} />}>
            <Pencil /> Editar
          </Button>
        </div>
        {(criado || salvo) && (
          <p className="border-pago-fill/30 bg-pago-fill/10 text-pago flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" role="status">
            <CheckCircle2 className="size-4" aria-hidden /> {criado ? 'Cliente cadastrado. Lance empréstimos para ele pelo Telegram.' : 'Alterações salvas.'}
          </p>
        )}
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard rotulo="Saldo em aberto" valor={fmt.dinheiro(m.saldoAtual)} href={ops} icone={Wallet} tom={atrasado ? 'atraso' : m.saldoAtual ? 'em-dia' : 'pago'} corValor={atrasado} detalhe={`${m.operacoesEmAberto} contrato(s) em aberto`} />
        <KpiCard rotulo="Total emprestado" valor={fmt.dinheiro(m.totalEmprestado)} href={ops} icone={Banknote} detalhe={`${m.operacoes} contrato(s) no total`} />
        <KpiCard rotulo="Total recebido" valor={fmt.dinheiro(m.totalRecebido)} href={ops} icone={HandCoins} tom="pago" corValor />
        <KpiCard
          rotulo="Pago em dia"
          valor={m.percentualPagoEmDia === null ? '—' : fmt.pct(m.percentualPagoEmDia)}
          href={ops}
          icone={m.atrasoMedioDias ? CalendarX2 : Gauge}
          tom={pont}
          corValor
          detalhe={`atraso médio ${m.atrasoMedioDias === null ? '—' : `${m.atrasoMedioDias.toFixed(1)} dias`} · ${m.renegociacoes} renegociação(ões)`}
        />
      </section>

      <Secao titulo="Contratos" semPadding>
        {c.operacoes.length === 0 ? (
          <Vazio icone={FileText} titulo="Nenhum contrato" />
        ) : (
          <ul className="divide-y">
            {c.operacoes.map((o) => {
              const saldo = saldoOperacao(c, o.id);
              const pago = c.parcelas.filter((p) => p.operacao_id === o.id).reduce((a, p) => a + p.valor_pago, 0);
              const total = c.parcelas.filter((p) => p.operacao_id === o.id && p.status !== 'cancelada').reduce((a, p) => a + p.valor, 0);
              return (
                <li key={o.id}>
                  <Link href={`/operacoes/${o.id}`} className="hover:bg-muted/40 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors sm:grid-cols-[1fr_10rem_auto_auto]">
                    <span className="text-sm">
                      <span className="font-medium">{fmt.data(o.data_emprestimo)}</span>
                      <span className="text-muted-foreground block text-xs tabular-nums">
                        {fmt.dinheiro(o.valor_principal)} → {fmt.dinheiro(o.valor_total_receber)}
                      </span>
                    </span>
                    <BarraProgresso pago={pago} total={total} atrasado={o.status === 'atrasada'} className="hidden sm:flex" />
                    <StatusBadge status={o.status} />
                    <span className={cn('w-28 text-right font-semibold tabular-nums', saldo === 0 ? 'text-pago' : o.status === 'atrasada' ? 'text-atraso' : '')}>{fmt.dinheiro(saldo)}</span>
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
