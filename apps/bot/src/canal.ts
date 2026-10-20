import { formatarDocumento, listarAtrasados, mascararTelefone, saldoParcela, somarDias, type DataISO } from '@cobra/core';
import { paraParcela, type CarteiraCompleta, type PlanoOperacao } from '@cobra/db';
import { documentoRotulado } from './consultas';
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
    docRotulado: documentoRotulado(cliente?.documento_tipo ?? null, cliente?.documento ?? null),
    telefone: cliente?.telefone ? mascararTelefone(cliente.telefone) : null,
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

/**
 * Devedores do dia (enviada 3x ao dia, com o status do momento): quem vence hoje + quem está
 * atrasado. Sem ninguém, diz isso explicitamente.
 */
export function mensagemDevedoresDoDia(c: CarteiraCompleta, hoje: DataISO, hora: string, f: Formatador, botUsername: string): Resposta {
  const ano = hoje.slice(0, 4);
  const atualizado = `atualizado às ${hora}`;
  const abertas = new Set(c.operacoes.filter((o) => ['ativa', 'atrasada', 'renegociada'].includes(o.status)).map((o) => o.id));
  const deHoje = c.parcelas
    .filter((p) => abertas.has(p.operacao_id) && p.vencimento === hoje)
    .map((p) => info(c, p.id)!)
    .filter((i) => i.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo);
  const atrasados = listarAtrasados(c.carteira, hoje);
  if (deHoje.length === 0 && atrasados.length === 0) {
    return { texto: `✅ <b>Nenhum devedor hoje (${f.data(hoje, ano)})</b>\nNinguém vence hoje e não há contratos atrasados.\n<i>${atualizado}</i>` };
  }
  const totalHoje = deHoje.reduce((a, i) => a + i.saldo, 0);
  const totalAtraso = atrasados.reduce((a, x) => a + x.saldo, 0);
  const linhas = [
    `📋 <b>Devedores do dia · ${f.data(hoje, ano)}</b>`,
    `${deHoje.length + atrasados.length} contrato(s) · total <b>${f.dinheiro(totalHoje + totalAtraso)}</b> · <i>${atualizado}</i>`,
  ];
  if (deHoje.length) {
    linhas.push('', `📅 <b>Vencem hoje</b> (${deHoje.length}) · ${f.dinheiro(totalHoje)}`);
    for (const i of deHoje) linhas.push(`• <b>${escapar(i.nome)}</b>${i.rotulo} — ${f.dinheiro(i.saldo)}`);
  }
  if (atrasados.length) {
    linhas.push('', `🔴 <b>Atrasados</b> (${atrasados.length}) · ${f.dinheiro(totalAtraso)}`);
    for (const x of atrasados) {
      const i = info(c, x.parcelaId)!;
      linhas.push(
        `• <b>${escapar(i.nome)}</b>${i.rotulo} — ${f.dinheiro(x.saldo)}\n   ${x.diasAtraso} dia(s) de atraso · venceu ${f.data(x.vencimento, ano)}${i.doc && i.doc !== '—' ? ` · ${i.doc}` : ''}`,
      );
    }
  }
  return {
    texto: linhas.join('\n'),
    teclado: botoesLinks(
      [
        ...deHoje.map((i) => ({ nome: i.nome, valor: f.dinheiro(i.saldo), id: i.p.id })),
        ...atrasados.map((x) => ({ nome: info(c, x.parcelaId)!.nome, valor: f.dinheiro(x.saldo), id: x.parcelaId })),
      ],
      botUsername,
    ),
  };
}

/**
 * Vencem amanhã (enviada à noite, com o status do momento): planejar as cobranças do dia seguinte.
 * Atrasados ficam de fora: eles já estão nos Devedores do dia.
 */
export function mensagemVencemAmanha(c: CarteiraCompleta, hoje: DataISO, hora: string, f: Formatador, botUsername: string): Resposta {
  const amanha = somarDias(hoje, 1);
  const titulo = `📆 <b>Vencem amanhã · ${f.data(amanha, amanha.slice(0, 4))}</b>`;
  const abertas = new Set(c.operacoes.filter((o) => ['ativa', 'atrasada', 'renegociada'].includes(o.status)).map((o) => o.id));
  const itens = c.parcelas
    .filter((p) => abertas.has(p.operacao_id) && p.vencimento === amanha)
    .map((p) => info(c, p.id)!)
    .filter((i) => i.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo);
  if (itens.length === 0) return { texto: `${titulo}
✅ Ninguém vence amanhã.
<i>atualizado às ${hora}</i>` };
  const total = itens.reduce((a, i) => a + i.saldo, 0);
  const linhas = [titulo, `${itens.length} contrato(s) · total <b>${f.dinheiro(total)}</b> · <i>atualizado às ${hora}</i>`, ''];
  for (const i of itens) {
    linhas.push(`• <b>${escapar(i.nome)}</b>${i.rotulo} — ${f.dinheiro(i.saldo)}\n   ${i.docRotulado}${i.telefone ? ` · 📞 ${i.telefone}` : ''}`);
  }
  return {
    texto: linhas.join('\n'),
    teclado: botoesLinks(itens.map((i) => ({ nome: i.nome, valor: f.dinheiro(i.saldo), id: i.p.id })), botUsername),
  };
}

export function mensagemNovoEmprestimo(plano: PlanoOperacao, doc: string, hoje: DataISO, f: Formatador): Resposta {
  const { entrada: e, indicadores: i, parcelas } = plano;
  const ano = hoje.slice(0, 4);
  const venc =
    parcelas.length === 1
      ? `vence ${f.data(parcelas[0]!.vencimento, ano)}`
      : `${parcelas.length} parcelas ${e.periodicidade === 'semanal' ? 'semanais' : e.periodicidade === 'quinzenal' ? 'quinzenais' : 'mensais'} de ${f.dinheiro(parcelas[0]!.valor)} a partir de ${f.data(parcelas[0]!.vencimento, ano)}`;
  const vencida = parcelas[0]!.vencimento < hoje;
  return {
    texto: [
      `🆕 <b>Novo empréstimo</b>${vencida ? ` · ⚠️ <b>já vencido</b> desde ${f.data(parcelas[0]!.vencimento, ano)}` : ''}`,
      `<b>${escapar(plano.clienteNome)}</b>${doc && doc !== '—' ? ` · ${doc}` : ''}`,
      `Emprestado ${f.dinheiro(e.principal)} → recebe <b>${f.dinheiro(e.totalReceber)}</b> (juros ${f.dinheiro(i.jurosTotal)})`,
      `${venc} · ${f.pct(i.taxaEfetivaMensal)} a.m.`,
    ].join('\n'),
  };
}
