import {
  alocarPagamento,
  calcularIndicadores,
  calcularPerda,
  calcularStatusOperacao,
  calcularStatusParcela,
  ErroRegra,
  estrategiaPorNome,
  gerarParcelas,
  renegociarParcela,
  renovarPagandoJuros,
  saldoParcela,
  vencimentoRenovacao,
  type Alocacao,
  type Centavos,
  type DataISO,
  type IndicadoresOperacao,
  type ParcelaEstado,
  type ParcelaPlano,
  type Periodicidade,
  type ResultadoRenegociacao,
  type ResultadoRenovacao,
  type StatusOperacao,
  type StatusParcela,
} from '@cobra/core';
import type { Json } from './database.types';
import { paraParcela, type ParcelaRow } from './mapeadores';
import { ok, semErro, type Repositorio } from './repositorio';

/**
 * Serviços de aplicação: "planejar" calcula tudo com o core e devolve um plano
 * serializável (guardado na sessão do bot para confirmação); "executar" aplica o plano
 * numa única transação via RPC.
 */

export interface MetaLancamento {
  origem: 'telegram' | 'web';
  mensagemTelegram?: string | null;
  mensagemOrigemId?: number | null;
}

// ───────────────────────── criar operação ─────────────────────────

export interface EntradaOperacao {
  clienteId: string;
  dataEmprestimo: DataISO;
  principal: Centavos;
  totalReceber: Centavos;
  numeroParcelas: number;
  primeiroVencimento: DataISO;
  periodicidade: Periodicidade;
  observacoes?: string | null;
}

export interface PlanoOperacao {
  entrada: EntradaOperacao;
  clienteNome: string;
  parcelas: ParcelaPlano[];
  indicadores: IndicadoresOperacao;
}

export async function planejarOperacao(repo: Repositorio, e: EntradaOperacao): Promise<PlanoOperacao> {
  const cliente = await repo.cliente(e.clienteId);
  if (!cliente) throw new ErroRegra('cliente_inexistente', 'Cliente não encontrado');
  const parcelas = gerarParcelas(e);
  return {
    entrada: e,
    clienteNome: cliente.nome,
    parcelas,
    indicadores: calcularIndicadores({ dataEmprestimo: e.dataEmprestimo, principal: e.principal, parcelas }),
  };
}

export async function executarOperacao(repo: Repositorio, plano: PlanoOperacao, meta: MetaLancamento): Promise<string> {
  const { entrada: e, indicadores: ind } = plano;
  const payload = {
    cliente_id: e.clienteId,
    data_emprestimo: e.dataEmprestimo,
    valor_principal: e.principal,
    valor_total_receber: e.totalReceber,
    juros_total: ind.jurosTotal,
    taxa_periodo: ind.taxaPeriodo,
    taxa_efetiva_mensal: ind.taxaEfetivaMensal,
    tipo: e.numeroParcelas === 1 ? 'unica' : 'parcelada',
    periodicidade: e.numeroParcelas === 1 ? null : e.periodicidade,
    observacoes: e.observacoes ?? null,
    origem: meta.origem,
    mensagem_origem_id: meta.mensagemOrigemId ?? null,
    mensagem_telegram: meta.mensagemTelegram ?? null,
    parcelas: plano.parcelas.map((p) => ({
      numero: p.numero,
      vencimento: p.vencimento,
      valor: p.valor,
      valor_principal: p.valorPrincipal,
      valor_juros: p.valorJuros,
    })),
  };
  return ok(await repo.db.rpc('rpc_criar_operacao', { p: payload as unknown as Json }));
}

// ───────────────────────── pagamento ─────────────────────────

export interface AlocacaoPlanejada extends Alocacao {
  vencimento: DataISO;
  valorPagoAnterior: Centavos;
  novoStatus: StatusParcela;
}

export interface PlanoPagamento {
  clienteId: string;
  clienteNome: string;
  data: DataISO;
  valor: Centavos;
  forma: string | null;
  alocacoes: AlocacaoPlanejada[];
  operacoes: { id: string; status: StatusOperacao }[];
  excedente: Centavos;
}

/** Parcelas com saldo de operações em aberto, do cliente ou da operação/parcela informada. */
async function parcelasAlvo(
  repo: Repositorio,
  alvo: { clienteId?: string; operacaoId?: string; parcelaId?: string },
): Promise<{ clienteId: string; todas: ParcelaRow[]; alvo: ParcelaRow[] }> {
  let operacaoId = alvo.operacaoId;
  if (alvo.parcelaId) {
    const p = ok(await repo.db.from('parcelas').select('operacao_id').eq('id', alvo.parcelaId).single());
    operacaoId = p.operacao_id;
  }
  const c = await repo.carregarCarteira(operacaoId ? { operacaoId } : { clienteId: alvo.clienteId! });
  const abertas = new Set(
    c.operacoes.filter((o) => ['ativa', 'atrasada', 'renegociada'].includes(o.status)).map((o) => o.id),
  );
  const todas = c.parcelas.filter((p) => abertas.has(p.operacao_id));
  let lista = todas.filter((p) => saldoParcela(paraParcela(p)).total > 0);
  if (alvo.parcelaId) {
    // A parcela escolhida vem primeiro; o excedente segue para as próximas da mesma operação.
    lista = [
      ...lista.filter((p) => p.id === alvo.parcelaId),
      ...lista.filter((p) => p.id !== alvo.parcelaId),
    ];
  }
  const clienteId = alvo.clienteId ?? c.operacoes[0]?.cliente_id;
  if (!clienteId) throw new ErroRegra('sem_operacao', 'Operação não encontrada');
  return { clienteId, todas, alvo: lista };
}

export async function planejarPagamento(
  repo: Repositorio,
  e: {
    clienteId?: string;
    operacaoId?: string;
    parcelaId?: string;
    valor: Centavos;
    data?: DataISO;
    forma?: string | null;
  },
): Promise<PlanoPagamento> {
  const [config, hoje] = [await repo.configuracao(), await repo.hoje()];
  const { clienteId, todas, alvo } = await parcelasAlvo(repo, e);
  if (alvo.length === 0) throw new ErroRegra('sem_saldo', 'Não há parcelas em aberto para este pagamento');

  const estados = alvo.map(paraParcela);
  // Com parcela escolhida explicitamente, respeita a ordem dada (não reordena por vencimento).
  const resultado = e.parcelaId
    ? alocarEmOrdem(e.valor, estados, config.estrategiaAlocacao)
    : alocarPagamento(e.valor, estados, estrategiaPorNome(config.estrategiaAlocacao));

  // Estado após o pagamento, para calcular os novos status.
  const depois = new Map<string, ParcelaEstado>(todas.map((p) => [p.id, paraParcela(p)]));
  const alocacoes: AlocacaoPlanejada[] = resultado.alocacoes.map((a) => {
    const p = depois.get(a.parcelaId)!;
    const novo: ParcelaEstado = {
      ...p,
      valorPago: p.valorPago + a.valor,
      principalPago: p.principalPago + a.principal,
      jurosPago: p.jurosPago + a.juros,
    };
    depois.set(a.parcelaId, novo);
    return {
      ...a,
      vencimento: p.vencimento,
      valorPagoAnterior: p.valorPago,
      novoStatus: calcularStatusParcela(novo, hoje),
    };
  });

  const opIds = [...new Set(alocacoes.map((a) => a.operacaoId))];
  const operacoes = opIds.map((id) => ({
    id,
    status: calcularStatusOperacao(
      { status: 'ativa' as StatusOperacao, renegociacoes: 0 },
      [...depois.values()].filter((p) => p.operacaoId === id),
      hoje,
    ),
  }));
  // Preserva "renegociada" quando aplicável.
  const renegs = ok(await repo.db.from('operacoes').select('id, renegociacoes').in('id', opIds));
  for (const o of operacoes) {
    const r = renegs.find((x) => x.id === o.id)?.renegociacoes ?? 0;
    if (o.status === 'ativa' && r > 0) o.status = 'renegociada';
  }

  const cliente = await repo.cliente(clienteId);
  return {
    clienteId,
    clienteNome: cliente?.nome ?? '',
    data: e.data ?? hoje,
    valor: e.valor,
    forma: e.forma ?? null,
    alocacoes,
    operacoes,
    excedente: resultado.excedente,
  };
}

function alocarEmOrdem(valor: Centavos, parcelas: ParcelaEstado[], estrategia: 'proporcional' | 'juros_primeiro') {
  // alocarPagamento ordena por vencimento; para respeitar a ordem dada, aloca uma a uma.
  let restante = valor;
  const alocacoes: Alocacao[] = [];
  for (const p of parcelas) {
    if (restante <= 0) break;
    const r = alocarPagamento(restante, [p], estrategiaPorNome(estrategia));
    alocacoes.push(...r.alocacoes);
    restante = r.excedente;
  }
  return { alocacoes, excedente: restante };
}

export async function executarPagamento(repo: Repositorio, plano: PlanoPagamento, meta: MetaLancamento): Promise<string> {
  if (plano.excedente > 0) {
    throw new ErroRegra('excedente', 'O valor é maior que o saldo em aberto do cliente');
  }
  const payload = {
    data: plano.data,
    forma: plano.forma,
    observacoes: null,
    origem: meta.origem,
    mensagem_telegram: meta.mensagemTelegram ?? null,
    alocacoes: plano.alocacoes.map((a) => ({
      parcela_id: a.parcelaId,
      operacao_id: a.operacaoId,
      valor: a.valor,
      principal: a.principal,
      juros: a.juros,
      valor_pago_anterior: a.valorPagoAnterior,
      status: a.novoStatus,
    })),
    operacoes: plano.operacoes,
  };
  return ok(await repo.db.rpc('rpc_registrar_pagamento', { p: payload as unknown as Json }));
}

// ───────────────────────── renegociação ─────────────────────────

export interface PlanoRenegociacao {
  parcelaId: string;
  operacaoId: string;
  clienteId: string;
  clienteNome: string;
  numero: number;
  totalParcelas: number;
  resultado: ResultadoRenegociacao;
  novoStatusParcela: StatusParcela;
  novoStatusOperacao: StatusOperacao;
  indicadores: IndicadoresOperacao;
}

/** Próximas parcelas em aberto do cliente (para escolher qual prorrogar). */
export async function parcelasEmAbertoDoCliente(repo: Repositorio, clienteId: string) {
  const { alvo } = await parcelasAlvo(repo, { clienteId });
  return alvo
    .map(paraParcela)
    .sort((a, b) => (a.vencimento === b.vencimento ? a.numero - b.numero : a.vencimento < b.vencimento ? -1 : 1));
}

export async function planejarRenegociacao(
  repo: Repositorio,
  e: { parcelaId: string; novoVencimento?: DataISO; acrescimo?: Centavos },
): Promise<PlanoRenegociacao> {
  const hoje = await repo.hoje();
  const par = ok(await repo.db.from('parcelas').select('*').eq('id', e.parcelaId).single());
  const c = await repo.carregarCarteira({ operacaoId: par.operacao_id });
  const op = c.operacoes[0];
  if (!op) throw new ErroRegra('sem_operacao', 'Operação não encontrada');
  if (!['ativa', 'atrasada', 'renegociada'].includes(op.status)) {
    throw new ErroRegra('operacao_fechada', 'Esta operação não está em aberto');
  }
  const alteracao: { novoVencimento?: DataISO; acrescimo?: Centavos } = {};
  if (e.novoVencimento) alteracao.novoVencimento = e.novoVencimento;
  if (e.acrescimo) alteracao.acrescimo = e.acrescimo;
  const resultado = renegociarParcela(paraParcela(par), alteracao);

  const parcelasDepois = c.parcelas.map((p) => {
    const est = paraParcela(p);
    return p.id === par.id
      ? { ...est, vencimento: resultado.depois.vencimento, valor: resultado.depois.valor, valorJuros: resultado.depois.valorJuros }
      : est;
  });
  const alvo = parcelasDepois.find((p) => p.id === par.id)!;
  const novoStatusOperacao = calcularStatusOperacao(
    { status: op.status, renegociacoes: op.renegociacoes + (resultado.alterouValor ? 1 : 0) },
    parcelasDepois,
    hoje,
  );
  const ativas = parcelasDepois.filter((p) => p.status !== 'cancelada');
  return {
    parcelaId: par.id,
    operacaoId: op.id,
    clienteId: op.cliente_id,
    clienteNome: c.clientes.get(op.cliente_id)?.nome ?? '',
    numero: par.numero,
    totalParcelas: c.parcelas.length,
    resultado,
    novoStatusParcela: calcularStatusParcela(alvo, hoje),
    novoStatusOperacao,
    indicadores: calcularIndicadores({ dataEmprestimo: op.data_emprestimo, principal: op.valor_principal, parcelas: ativas }),
  };
}

export async function executarRenegociacao(repo: Repositorio, plano: PlanoRenegociacao, meta: MetaLancamento): Promise<void> {
  const { antes, depois, acrescimo } = plano.resultado.evento.payload;
  const snake = (x: typeof antes) => ({ vencimento: x.vencimento, valor: x.valor, valor_juros: x.valorJuros });
  const payload = {
    parcela_id: plano.parcelaId,
    antes: snake(antes),
    depois: snake(depois),
    acrescimo,
    acao: plano.resultado.evento.acao,
    alterou_valor: plano.resultado.alterouValor,
    status: plano.novoStatusParcela,
    operacao_status: plano.novoStatusOperacao,
    taxa_periodo: plano.indicadores.taxaPeriodo,
    taxa_efetiva_mensal: plano.indicadores.taxaEfetivaMensal,
    mensagem_telegram: meta.mensagemTelegram ?? null,
  };
  semErro(await repo.db.rpc('rpc_renegociar_parcela', { p: payload as unknown as Json }));
}

// ───────────────────────── perda / cancelamento ─────────────────────────

export async function marcarPerda(repo: Repositorio, operacaoId: string, meta: MetaLancamento) {
  const c = await repo.carregarCarteira({ operacaoId });
  const perda = calcularPerda(c.carteira.parcelas);
  semErro(
    await repo.db.rpc('rpc_marcar_perda', {
      p: {
        operacao_id: operacaoId,
        perdida_em: await repo.hoje(),
        valor_prejuizo: perda.prejuizo,
        juros_nao_recebidos: perda.jurosNaoRecebidos,
        mensagem_telegram: meta.mensagemTelegram ?? null,
      },
    }),
  );
  return perda;
}

export async function cancelarOperacao(repo: Repositorio, operacaoId: string, motivo: string | null, meta: MetaLancamento) {
  semErro(
    await repo.db.rpc('rpc_cancelar_operacao', {
      p: { operacao_id: operacaoId, motivo, mensagem_telegram: meta.mensagemTelegram ?? null },
    }),
  );
}

// ───────────────────────── status (job) ─────────────────────────

/** Recalcula status de parcelas/operações em aberto (ex.: viraram atrasadas à meia-noite). */
export async function atualizarStatus(repo: Repositorio): Promise<number> {
  const hoje = await repo.hoje();
  const c = await repo.carregarCarteira();
  const parcelas: { id: string; status: StatusParcela }[] = [];
  const operacoes: { id: string; status: StatusOperacao }[] = [];
  for (const op of c.carteira.operacoes) {
    if (!['ativa', 'atrasada', 'renegociada'].includes(op.status)) continue;
    const ps = c.carteira.parcelas.filter((p) => p.operacaoId === op.id);
    for (const p of ps) {
      const s = calcularStatusParcela(p, hoje);
      if (s !== p.status) parcelas.push({ id: p.id, status: s });
    }
    const s = calcularStatusOperacao(op, ps, hoje);
    if (s !== op.status) operacoes.push({ id: op.id, status: s });
  }
  if (parcelas.length === 0 && operacoes.length === 0) return 0;
  return ok(await repo.db.rpc('rpc_atualizar_status', { p: { parcelas, operacoes } }));
}

// ───────────────────────── renovação (pagou só os juros) ─────────────────────────

export interface PlanoRenovacao {
  operacaoId: string;
  clienteId: string;
  clienteNome: string;
  parcelaId: string;
  numero: number;
  vencimentoAtual: DataISO;
  valorPagoAnterior: Centavos;
  data: DataISO;
  forma: string | null;
  resultado: ResultadoRenovacao;
  indicadores: IndicadoresOperacao;
  /** Quantas renovações/renegociações o contrato terá após esta. */
  renovacoes: number;
}

/** Contrato com UMA parcela em aberto: renova pagando (ao menos) os juros dela. */
export async function planejarRenovacao(
  repo: Repositorio,
  e: { operacaoId: string; valor: Centavos; data?: DataISO; forma?: string | null },
): Promise<PlanoRenovacao> {
  const hoje = await repo.hoje();
  const c = await repo.carregarCarteira({ operacaoId: e.operacaoId });
  const op = c.operacoes[0];
  if (!op || !['ativa', 'atrasada', 'renegociada'].includes(op.status)) {
    throw new ErroRegra('operacao_fechada', 'Este contrato não está em aberto');
  }
  const estados = c.parcelas.map(paraParcela);
  const abertas = estados.filter((p) => saldoParcela(p).total > 0);
  if (abertas.length !== 1) {
    throw new ErroRegra('renovacao_parcelado', 'A renovação vale para contrato com uma parcela em aberto');
  }
  const atual = abertas[0]!;
  const primeiro = [...estados].sort((a, b) => a.numero - b.numero)[0]!;
  const resultado = renovarPagandoJuros({
    parcela: atual,
    valorPago: e.valor,
    novoVencimento: vencimentoRenovacao(atual.vencimento, op.data_emprestimo, primeiro.vencimento),
    numeroNova: Math.max(...estados.map((p) => p.numero)) + 1,
  });
  const depois = [
    ...estados
      .filter((p) => p.status !== 'cancelada')
      .map((p) => (p.id === atual.id ? { vencimento: p.vencimento, valor: resultado.parcelaFechada.valor } : { vencimento: p.vencimento, valor: p.valor })),
    { vencimento: resultado.novaParcela.vencimento, valor: resultado.novaParcela.valor },
  ];
  return {
    operacaoId: op.id,
    clienteId: op.cliente_id,
    clienteNome: c.clientes.get(op.cliente_id)?.nome ?? '',
    parcelaId: atual.id,
    numero: atual.numero,
    vencimentoAtual: atual.vencimento,
    valorPagoAnterior: atual.valorPago,
    data: e.data ?? hoje,
    forma: e.forma ?? null,
    resultado,
    indicadores: calcularIndicadores({ dataEmprestimo: op.data_emprestimo, principal: op.valor_principal, parcelas: depois }),
    renovacoes: op.renegociacoes + 1,
  };
}

export async function executarRenovacao(repo: Repositorio, plano: PlanoRenovacao, meta: MetaLancamento): Promise<string> {
  const r = plano.resultado;
  const payload = {
    parcela_id: plano.parcelaId,
    valor_pago_anterior: plano.valorPagoAnterior,
    pagamento: { valor: r.pagamento.valor, principal: r.pagamento.principal, juros: r.pagamento.juros, data: plano.data, forma: plano.forma },
    fechada: { valor: r.parcelaFechada.valor, valor_principal: r.parcelaFechada.valorPrincipal, valor_juros: r.parcelaFechada.valorJuros },
    nova: {
      numero: r.novaParcela.numero,
      vencimento: r.novaParcela.vencimento,
      valor: r.novaParcela.valor,
      valor_principal: r.novaParcela.valorPrincipal,
      valor_juros: r.novaParcela.valorJuros,
    },
    operacao: { taxa_periodo: plano.indicadores.taxaPeriodo, taxa_efetiva_mensal: plano.indicadores.taxaEfetivaMensal },
    origem: meta.origem,
    mensagem_telegram: meta.mensagemTelegram ?? null,
  };
  return ok(await repo.db.rpc('rpc_renovar_parcela', { p: payload as unknown as Json }));
}
