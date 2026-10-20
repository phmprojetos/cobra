import 'server-only';
import {
  alocarPagamento,
  completarCpf,
  calcularIndicadores,
  calcularPerda,
  calcularStatusOperacao,
  calcularStatusParcela,
  dataLocal,
  estrategiaPorNome,
  gerarParcelas,
  saldoParcela,
  somarDias,
  type DataISO,
  type ParcelaEstado,
  type Periodicidade,
} from '@cobra/core';
import {
  CONFIG_PADRAO,
  paraOperacao,
  paraPagamento,
  paraParcela,
  type CarteiraCompleta,
  type ClienteRow,
  type Configuracao,
  type EventoRow,
  type OperacaoRow,
  type PagamentoRow,
  type ParcelaRow,
  type RegraRow,
} from '@cobra/db';

/**
 * Modo demonstração (DEMO=1): carteira fictícia em memória, gerada com as regras reais
 * do core (parcelamento, alocação, status). Pagamentos e configurações feitos no painel
 * alteram só a memória do servidor e somem ao reiniciar.
 */

export const MODO_DEMO = process.env.DEMO === '1';

let seq = 0;
const novoId = (p: string) => `${p}-${(++seq).toString(36).padStart(4, '0')}-demo`;
const agoraIso = () => new Date().toISOString();

/** PRNG determinístico (mesmos dados a cada reinício). */
function rng(semente: number) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type Perfil = 'bom' | 'medio' | 'ruim';

interface Plano {
  cliente: number;
  diasAtras: number;
  principal: number;
  total: number;
  n: number;
  periodicidade: Periodicidade;
  primeiroEm: number; // dias após o empréstimo
  mensagem?: string;
  fim?: 'perdida' | 'cancelada' | 'renegociar';
}

const CLIENTES: [string, string[], Perfil, string | null][] = [
  ['Carlos Souza', ['Carlão'], 'medio', '+55 11 98888-0001'],
  ['Ana Paula Ribeiro', ['Aninha'], 'bom', '+55 11 98888-0002'],
  ['Beatriz Lima', ['Bia'], 'bom', null],
  ['João Pedro Martins', ['JP'], 'medio', null],
  ['Marcos Silva', [], 'ruim', 'Indicado pelo Carlos'],
  ['Fernanda Rocha', ['Fê'], 'bom', null],
  ['Ricardo Alves', ['Rick'], 'ruim', null],
  ['Juliana Costa', ['Ju'], 'medio', null],
  ['Paulo Mendes', [], 'bom', null],
  ['Larissa Nunes', ['Lari'], 'medio', null],
  ['Eduardo Ramos', ['Edu'], 'ruim', null],
  ['Tatiane Lopes', ['Tati'], 'bom', null],
];

const PLANOS: Plano[] = [
  { cliente: 0, diasAtras: 35, principal: 200000, total: 240000, n: 1, periodicidade: 'mensal', primeiroEm: 56, mensagem: 'emprestei 2000 pro Carlos, volta 2400 dia 15/12' },
  { cliente: 0, diasAtras: 120, principal: 100000, total: 125000, n: 2, periodicidade: 'mensal', primeiroEm: 30 },
  { cliente: 1, diasAtras: 4, principal: 50000, total: 60000, n: 4, periodicidade: 'semanal', primeiroEm: 3, mensagem: 'Ana pegou 500, paga 600 em 4x semanais começando sexta' },
  { cliente: 1, diasAtras: 90, principal: 150000, total: 186000, n: 3, periodicidade: 'mensal', primeiroEm: 30 },
  { cliente: 2, diasAtras: 60, principal: 100000, total: 130000, n: 1, periodicidade: 'mensal', primeiroEm: 30 },
  { cliente: 2, diasAtras: 20, principal: 80000, total: 96000, n: 1, periodicidade: 'mensal', primeiroEm: 20 },
  { cliente: 3, diasAtras: 40, principal: 300000, total: 390000, n: 3, periodicidade: 'mensal', primeiroEm: 30, fim: 'renegociar' },
  { cliente: 4, diasAtras: 42, principal: 150000, total: 180000, n: 1, periodicidade: 'mensal', primeiroEm: 30 },
  { cliente: 4, diasAtras: 150, principal: 60000, total: 78000, n: 3, periodicidade: 'mensal', primeiroEm: 30, fim: 'perdida' },
  { cliente: 5, diasAtras: 25, principal: 400000, total: 480000, n: 6, periodicidade: 'quinzenal', primeiroEm: 15 },
  { cliente: 6, diasAtras: 50, principal: 120000, total: 156000, n: 4, periodicidade: 'semanal', primeiroEm: 7 },
  { cliente: 7, diasAtras: 10, principal: 70000, total: 84000, n: 2, periodicidade: 'quinzenal', primeiroEm: 6 },
  { cliente: 8, diasAtras: 15, principal: 250000, total: 300000, n: 1, periodicidade: 'mensal', primeiroEm: 16 },
  { cliente: 9, diasAtras: 30, principal: 90000, total: 108000, n: 4, periodicidade: 'semanal', primeiroEm: 9 },
  { cliente: 10, diasAtras: 70, principal: 200000, total: 260000, n: 4, periodicidade: 'quinzenal', primeiroEm: 15 },
  { cliente: 11, diasAtras: 8, principal: 150000, total: 175000, n: 1, periodicidade: 'mensal', primeiroEm: 9 },
  { cliente: 11, diasAtras: 3, principal: 50000, total: 60000, n: 1, periodicidade: 'mensal', primeiroEm: 30, fim: 'cancelada' },
  { cliente: 8, diasAtras: 2, principal: 120000, total: 150000, n: 5, periodicidade: 'semanal', primeiroEm: 5 },
  { cliente: 5, diasAtras: 1, principal: 60000, total: 72000, n: 1, periodicidade: 'mensal', primeiroEm: 1 },
];

const REGRAS: Omit<RegraRow, 'id' | 'created_at' | 'updated_at'>[] = [
  { tipo: 'lembrete_antes', offset_dias: 1, horario: '09:00:00', dia_semana: null, ativo: true, silenciar_clientes: [] },
  { tipo: 'no_dia', offset_dias: 0, horario: '09:00:00', dia_semana: null, ativo: true, silenciar_clientes: [] },
  { tipo: 'atraso', offset_dias: 1, horario: '10:00:00', dia_semana: null, ativo: true, silenciar_clientes: [] },
  { tipo: 'atraso', offset_dias: 3, horario: '10:00:00', dia_semana: null, ativo: true, silenciar_clientes: [] },
  { tipo: 'atraso', offset_dias: 7, horario: '10:00:00', dia_semana: null, ativo: true, silenciar_clientes: [] },
  { tipo: 'resumo_diario', offset_dias: 0, horario: '08:00:00', dia_semana: null, ativo: true, silenciar_clientes: [] },
  { tipo: 'resumo_semanal', offset_dias: 0, horario: '08:00:00', dia_semana: 1, ativo: true, silenciar_clientes: [] },
  { tipo: 'lista_atrasados', offset_dias: 0, horario: '09:00:00', dia_semana: null, ativo: true, silenciar_clientes: [] },
];

interface Estado {
  config: Configuracao;
  clientes: ClienteRow[];
  operacoes: OperacaoRow[];
  parcelas: ParcelaRow[];
  pagamentos: PagamentoRow[];
  eventos: EventoRow[];
  regras: RegraRow[];
}

function hoje(config: Configuracao): DataISO {
  return dataLocal(new Date(), config.timezone);
}

function paraRow(p: ParcelaEstado, criado: string): ParcelaRow {
  return {
    id: p.id,
    operacao_id: p.operacaoId,
    numero: p.numero,
    vencimento: p.vencimento,
    valor: p.valor,
    valor_principal: p.valorPrincipal,
    valor_juros: p.valorJuros,
    valor_pago: p.valorPago,
    principal_pago: p.principalPago,
    juros_pago: p.jurosPago,
    status: p.status,
    cancelado_em: null,
    created_at: criado,
    updated_at: criado,
  };
}

function evento(entidade: string, entidadeId: string, acao: string, payload: object, data: DataISO, mensagem: string | null = null): EventoRow {
  const em = `${data}T12:00:00.000Z`;
  return { id: novoId('ev'), entidade, entidade_id: entidadeId, acao, payload: payload as EventoRow['payload'], mensagem_telegram: mensagem, created_at: em, updated_at: em };
}

function gerar(): Estado {
  const config = { ...CONFIG_PADRAO };
  const h = hoje(config);
  const aleatorio = rng(42);
  const criado = agoraIso();
  const clientes: ClienteRow[] = CLIENTES.map(([nome, apelidos, , extra], i) => ({
    id: novoId('cli'),
    nome,
    apelidos,
    documento_tipo: 'cpf',
    documento: completarCpf(String(123450000 + i * 7919)),
    telefone: extra?.startsWith('+') ? extra : null,
    observacoes: extra && !extra.startsWith('+') ? extra : null,
    ativo: true,
    created_at: criado,
    updated_at: criado,
  }));
  const est: Estado = { config, clientes, operacoes: [], parcelas: [], pagamentos: [], eventos: [], regras: [] };
  est.regras = REGRAS.map((r) => ({ ...r, id: novoId('regra'), created_at: criado, updated_at: criado }));

  for (const pl of PLANOS) {
    const cli = clientes[pl.cliente]!;
    const perfil = CLIENTES[pl.cliente]![2];
    const dataEmp = somarDias(h, -pl.diasAtras);
    const plano = gerarParcelas({
      dataEmprestimo: dataEmp,
      principal: pl.principal,
      totalReceber: pl.total,
      numeroParcelas: pl.n,
      primeiroVencimento: somarDias(dataEmp, pl.primeiroEm),
      periodicidade: pl.periodicidade,
    });
    const ind = calcularIndicadores({ dataEmprestimo: dataEmp, principal: pl.principal, parcelas: plano });
    const opId = novoId('op');
    const estados: ParcelaEstado[] = plano.map((p) => ({ ...p, id: novoId('par'), operacaoId: opId, valorPago: 0, principalPago: 0, jurosPago: 0, status: 'aberta' }));

    // Pagamentos conforme o perfil do cliente, só de parcelas já vencidas (ou hoje).
    for (const p of estados) {
      if (p.vencimento > h || pl.fim === 'cancelada') continue;
      const r = aleatorio();
      let atraso = 0;
      let fracao = 1;
      if (perfil === 'bom') atraso = r < 0.85 ? 0 : 2;
      else if (perfil === 'medio') {
        atraso = r < 0.5 ? 0 : 3 + Math.floor(r * 5);
        if (r > 0.85) fracao = 0.5;
      } else {
        if (r < 0.45 || pl.fim === 'perdida') fracao = p.numero === 1 ? 0.4 : 0;
        atraso = 5 + Math.floor(r * 10);
      }
      const dataPag = somarDias(p.vencimento, atraso);
      if (fracao === 0 || dataPag > h) continue;
      const valor = Math.round(saldoParcela(p).total * fracao);
      registrarPagamentoInterno(est, opId, estados, p.id, valor, dataPag, perfil === 'bom' ? 'pix' : 'dinheiro');
    }

    const op: OperacaoRow = {
      id: opId,
      cliente_id: cli.id,
      data_emprestimo: dataEmp,
      valor_principal: pl.principal,
      valor_total_receber: pl.total,
      juros_total: ind.jurosTotal,
      taxa_periodo: ind.taxaPeriodo,
      taxa_efetiva_mensal: ind.taxaEfetivaMensal,
      tipo: pl.n === 1 ? 'unica' : 'parcelada',
      periodicidade: pl.n === 1 ? null : pl.periodicidade,
      status: 'ativa',
      renegociacoes: 0,
      valor_prejuizo: 0,
      perdida_em: null,
      cancelado_em: null,
      observacoes: null,
      origem: 'telegram',
      mensagem_origem_id: null,
      created_at: `${dataEmp}T12:00:00.000Z`,
      updated_at: criado,
    };
    est.eventos.push(evento('operacao', opId, 'criar', { valor_principal: pl.principal, valor_total_receber: pl.total }, dataEmp, pl.mensagem ?? `emprestei ${pl.principal / 100} pro ${cli.nome.split(' ')[0]}, volta ${pl.total / 100}`));

    if (pl.fim === 'renegociar') {
      const alvo = estados.find((p) => saldoParcela(p).total > 0)!;
      const antes = { vencimento: alvo.vencimento, valor: alvo.valor, valor_juros: alvo.valorJuros };
      alvo.vencimento = somarDias(alvo.vencimento, 15);
      alvo.valor += 10000;
      alvo.valorJuros += 10000;
      op.renegociacoes = 1;
      op.valor_total_receber += 10000;
      op.juros_total += 10000;
      est.eventos.push(evento('parcela', alvo.id, 'renegociar', { operacao_id: opId, antes, depois: { vencimento: alvo.vencimento, valor: alvo.valor, valor_juros: alvo.valorJuros }, acrescimo: 10000 }, somarDias(h, -5), 'joga o vencimento do JP pra frente 15 dias com mais 100'));
    }
    for (const p of estados) p.status = calcularStatusParcela(p, h);
    op.status = calcularStatusOperacao({ status: 'ativa', renegociacoes: op.renegociacoes }, estados, h);
    if (pl.fim === 'perdida') {
      const perda = calcularPerda(estados);
      op.status = 'perdida';
      op.perdida_em = somarDias(h, -6);
      op.valor_prejuizo = perda.prejuizo;
      est.eventos.push(evento('operacao', opId, 'perda', { valor_prejuizo: perda.prejuizo }, op.perdida_em));
    }
    if (pl.fim === 'cancelada') {
      op.status = 'cancelada';
      op.cancelado_em = criado;
      for (const p of estados) p.status = 'cancelada';
      est.eventos.push(evento('operacao', opId, 'cancelar', { motivo: 'lançado em duplicidade' }, h));
    }
    est.operacoes.push(op);
    est.parcelas.push(...estados.map((p) => paraRow(p, criado)));
  }
  return est;
}

/** Aplica um pagamento nos estados (core) e registra as linhas + evento. */
function registrarPagamentoInterno(est: Estado, opId: string, estados: ParcelaEstado[], parcelaId: string, valor: number, data: DataISO, forma: string | null) {
  const ordem = [...estados.filter((p) => p.id === parcelaId), ...estados.filter((p) => p.id !== parcelaId)];
  const r = alocarPagamento(valor, ordem, estrategiaPorNome(est.config.estrategiaAlocacao));
  const lote = novoId('lote');
  for (const a of r.alocacoes) {
    const p = estados.find((x) => x.id === a.parcelaId)!;
    p.valorPago += a.valor;
    p.principalPago += a.principal;
    p.jurosPago += a.juros;
    const em = `${data}T12:00:00.000Z`;
    est.pagamentos.push({ id: novoId('pag'), parcela_id: p.id, lote_id: lote, data, valor: a.valor, valor_principal_alocado: a.principal, valor_juros_alocado: a.juros, forma, observacoes: null, origem: 'telegram', cancelado_em: null, created_at: em, updated_at: em });
  }
  est.eventos.push(evento('operacao', opId, 'pagamento', { lote_id: lote, data, alocacoes: r.alocacoes }, data, forma === 'pix' ? null : `${valor / 100} recebido`));
  return r;
}

const g = globalThis as unknown as { __cobraDemo?: Estado };
function estado(): Estado {
  return (g.__cobraDemo ??= gerar());
}

/** Fonte de dados em memória com a mesma interface usada pelas páginas. */
export const fonteDemo = {
  async configuracao() {
    return estado().config;
  },
  async hoje() {
    return hoje(estado().config);
  },
  async regras() {
    return estado().regras;
  },
  async eventos(ids: string[]) {
    const s = new Set(ids);
    return estado().eventos.filter((e) => s.has(e.entidade_id)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  },
  async carregarCarteira(filtro: { clienteId?: string; operacaoId?: string } = {}): Promise<CarteiraCompleta> {
    const e = estado();
    const operacoes = e.operacoes
      .filter((o) => (filtro.operacaoId ? o.id === filtro.operacaoId : o.status !== 'cancelada'))
      .filter((o) => !filtro.clienteId || o.cliente_id === filtro.clienteId)
      .sort((a, b) => (a.data_emprestimo < b.data_emprestimo ? 1 : -1));
    const ids = new Set(operacoes.map((o) => o.id));
    const parcelas = e.parcelas.filter((p) => ids.has(p.operacao_id));
    const pids = new Set(parcelas.map((p) => p.id));
    const pagamentos = e.pagamentos.filter((p) => pids.has(p.parcela_id));
    return {
      clientes: new Map(e.clientes.map((c) => [c.id, c])),
      operacoes,
      parcelas,
      pagamentos,
      carteira: { operacoes: operacoes.map(paraOperacao), parcelas: parcelas.map(paraParcela), pagamentos: pagamentos.map(paraPagamento) },
    };
  },

  // ─── mutações do modo demo ───
  pagar(parcelaId: string, valor: number, data: DataISO | undefined, forma: string | null): string | null {
    const e = estado();
    const par = e.parcelas.find((p) => p.id === parcelaId);
    if (!par) return 'Parcela não encontrada.';
    const op = e.operacoes.find((o) => o.id === par.operacao_id)!;
    const linhas = e.parcelas.filter((p) => p.operacao_id === op.id);
    const estados = linhas.map(paraParcela);
    const saldo = estados.reduce((a, p) => a + saldoParcela(p).total, 0);
    if (valor > saldo) return 'O valor é maior que o saldo em aberto deste empréstimo.';
    const h = hoje(e.config);
    registrarPagamentoInterno(e, op.id, estados, parcelaId, valor, data ?? h, forma);
    for (const p of estados) {
      p.status = calcularStatusParcela(p, h);
      Object.assign(linhas.find((l) => l.id === p.id)!, paraRow(p, agoraIso()));
    }
    op.status = calcularStatusOperacao({ status: op.status, renegociacoes: op.renegociacoes }, estados, h);
    return null;
  },
  salvarConfig(c: Partial<Configuracao>) {
    Object.assign(estado().config, c);
  },
  salvarRegra(id: string | null, dados: Omit<RegraRow, 'id' | 'created_at' | 'updated_at'>) {
    const e = estado();
    const agora = agoraIso();
    if (id) Object.assign(e.regras.find((r) => r.id === id)!, dados, { updated_at: agora });
    else e.regras.push({ ...dados, id: novoId('regra'), created_at: agora, updated_at: agora });
  },
};
