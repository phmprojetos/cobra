import { formatarDocumento, listarAtrasados, saldoParcela, type DataISO } from '@cobra/core';
import { paraParcela, type CarteiraCompleta, type PlanoOperacao } from '@cobra/db';
import { escapar, type Botao, type Formatador, type Resposta } from './formatacao';

/**
 * Mensagens do canal de alertas. O canal é só leitura: cada contrato traz um botão-link que
 * abre o bot no chat privado já com as ações (recebido, adiar), mantendo o canal limpo.
 */

/** Deep link para o chat privado: /start p_<parcela> abre a ficha da parcela com ações. */
export function linkParcela(botUsername: string, parcelaId: string): string {
  return `https://t.me/${botUsername}?start=p_${parcelaId}`;
}

function info(c: CarteiraCompleta, parcelaId: string) {
  const p = c.parcelas.find((x) => x.id === parcelaId);
  const op = p && c.operacoes.find((o) => o.id === p.operacao_id);
  if (!p || !op) return null;
  const cliente = c.clientes.get(op.cliente_id);
  const total = c.parcelas.filter((x) => x.operacao_id === op.id).length;
  return {
    p,
    nome: cliente?.nome ?? '?',
    doc: cliente ? formatarDocumento(cliente.documento_tipo, cliente.documento) : '',
    rotulo: total > 1 ? ` · parcela ${p.numero}/${total}` : '',
    saldo: saldoParcela(paraParcela(p)).total,
  };
}

/** Botões-link (no máximo 8) para abrir cada contrato no chat privado. */
function botoesLinks(itens: { nome: string; valor: string; id: string }[], botUsername: string): Botao[][] {
  return itens.slice(0, 8).map((i) => [{ texto: `${i.nome} · ${i.valor}`, dados: '', url: linkParcela(botUsername, i.id) }]);
}

export type TipoGrupo = 'lembrete_antes' | 'no_dia' | 'atraso';

/** Uma mensagem por regra e dia, listando todas as parcelas daquele alerta. */
export function mensagemGrupoParcelas(
  tipo: TipoGrupo,
  parcelaIds: readonly string[],
  c: CarteiraCompleta,
  hoje: DataISO,
  f: Formatador,
  botUsername: string,
): Resposta | null {
  const itens = parcelaIds.map((id) => info(c, id)).filter((x): x is NonNullable<typeof x> => !!x && x.saldo > 0);
  if (itens.length === 0) return null;
  const ano = hoje.slice(0, 4);
  const total = itens.reduce((a, i) => a + i.saldo, 0);
  const venc = itens[0]!.p.vencimento;
  const titulo =
    tipo === 'lembrete_antes'
      ? `⚠️ <b>ALERTA · ${venc === hoje ? 'vencem hoje' : `vencem em ${f.data(venc, ano)}`}</b>`
      : tipo === 'no_dia'
        ? `📅 <b>Vencem hoje (${f.data(hoje, ano)})</b>`
        : `🔴 <b>Atrasados desde ${f.data(venc, ano)}</b>`;
  const linhas = itens.map((i) => `• <b>${escapar(i.nome)}</b>${i.rotulo} — ${f.dinheiro(i.saldo)}`);
  return {
    texto: [titulo, `${itens.length} contrato(s) · total <b>${f.dinheiro(total)}</b>`, '', ...linhas].join('\n'),
    teclado: botoesLinks(itens.map((i) => ({ nome: i.nome, valor: f.dinheiro(i.saldo), id: i.p.id })), botUsername),
  };
}

/** Lista diária: "Hoje temos estes contratos atrasados". Null quando não há atraso (canal quieto). */
export function mensagemListaAtrasados(c: CarteiraCompleta, hoje: DataISO, f: Formatador, botUsername: string): Resposta | null {
  const lista = listarAtrasados(c.carteira, hoje);
  if (lista.length === 0) return null;
  const ano = hoje.slice(0, 4);
  const total = lista.reduce((a, x) => a + x.saldo, 0);
  const linhas = lista.map((x) => {
    const i = info(c, x.parcelaId)!;
    return `• <b>${escapar(i.nome)}</b>${i.rotulo} — ${f.dinheiro(x.saldo)}\n   ${x.diasAtraso} dia(s) de atraso · venceu ${f.data(x.vencimento, ano)}${i.doc && i.doc !== '—' ? ` · ${i.doc}` : ''}`;
  });
  return {
    texto: [`🔴 <b>Hoje (${f.data(hoje, ano)}) temos ${lista.length} contrato(s) atrasado(s)</b>`, `Total vencido: <b>${f.dinheiro(total)}</b>`, '', ...linhas].join('\n'),
    teclado: botoesLinks(
      lista.map((x) => ({ nome: info(c, x.parcelaId)!.nome, valor: f.dinheiro(x.saldo), id: x.parcelaId })),
      botUsername,
    ),
  };
}

export function mensagemNovoEmprestimo(plano: PlanoOperacao, doc: string, hoje: DataISO, f: Formatador): Resposta {
  const { entrada: e, indicadores: i, parcelas } = plano;
  const ano = hoje.slice(0, 4);
  const venc =
    parcelas.length === 1
      ? `vence ${f.data(parcelas[0]!.vencimento, ano)}`
      : `${parcelas.length} parcelas ${e.periodicidade === 'semanal' ? 'semanais' : e.periodicidade === 'quinzenal' ? 'quinzenais' : 'mensais'} de ${f.dinheiro(parcelas[0]!.valor)} a partir de ${f.data(parcelas[0]!.vencimento, ano)}`;
  return {
    texto: [
      `🆕 <b>Novo empréstimo</b>`,
      `<b>${escapar(plano.clienteNome)}</b>${doc && doc !== '—' ? ` · ${doc}` : ''}`,
      `Emprestado ${f.dinheiro(e.principal)} → recebe <b>${f.dinheiro(e.totalReceber)}</b> (juros ${f.dinheiro(i.jurosTotal)})`,
      `${venc} · ${f.pct(i.taxaEfetivaMensal)} a.m.`,
    ].join('\n'),
  };
}
