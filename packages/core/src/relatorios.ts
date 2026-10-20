import { diferencaDias, dentroDoPeriodo, inicioSemana, somarDias } from './datas';
import { saldoParcela, somarSaldos } from './saldo';
import { calcularStatusParcela, operacaoEmAberto } from './status';
import type {
  Centavos,
  DataISO,
  OperacaoEstado,
  PagamentoRegistro,
  ParcelaEstado,
  Periodo,
} from './tipos';

export interface Carteira {
  operacoes: readonly OperacaoEstado[];
  parcelas: readonly ParcelaEstado[];
  pagamentos: readonly PagamentoRegistro[];
}

function parcelasEmAberto(c: Carteira): ParcelaEstado[] {
  const abertas = new Set(c.operacoes.filter((o) => operacaoEmAberto(o.status)).map((o) => o.id));
  return c.parcelas.filter((p) => abertas.has(p.operacaoId) && saldoParcela(p).total > 0);
}

export interface Kpis {
  /** Principal em aberto. */
  capitalNaRua: Centavos;
  /** Principal + juros em aberto. */
  totalAReceber: Centavos;
  /** Saldo com vencimento de hoje até hoje+6. */
  aReceber7Dias: Centavos;
  /** Saldo de parcelas vencidas (antes de hoje). */
  totalVencido: Centavos;
  /** Juros recebidos (alocados em pagamentos) no período. */
  lucroRealizado: Centavos;
  /** Juros em aberto de parcelas que vencem no período. */
  lucroARealizar: Centavos;
  /** Prejuízo de operações marcadas como perdidas no período. */
  prejuizo: Centavos;
}

export function calcularKpis(c: Carteira, hoje: DataISO, periodo: Periodo): Kpis {
  const abertas = parcelasEmAberto(c);
  const total = somarSaldos(abertas.map(saldoParcela));
  const fim7 = somarDias(hoje, 6);
  const somaSaldo = (ps: ParcelaEstado[]) => somarSaldos(ps.map(saldoParcela));
  return {
    capitalNaRua: total.principal,
    totalAReceber: total.total,
    aReceber7Dias: somaSaldo(abertas.filter((p) => dentroDoPeriodo(p.vencimento, hoje, fim7))).total,
    totalVencido: somaSaldo(abertas.filter((p) => p.vencimento < hoje)).total,
    lucroRealizado: c.pagamentos
      .filter((p) => dentroDoPeriodo(p.data, periodo.inicio, periodo.fim))
      .reduce((a, p) => a + p.valorJurosAlocado, 0),
    lucroARealizar: somaSaldo(
      abertas.filter((p) => dentroDoPeriodo(p.vencimento, periodo.inicio, periodo.fim)),
    ).juros,
    prejuizo: c.operacoes
      .filter(
        (o) =>
          o.status === 'perdida' &&
          o.perdidaEm !== null &&
          dentroDoPeriodo(o.perdidaEm, periodo.inicio, periodo.fim),
      )
      .reduce((a, o) => a + o.valorPrejuizo, 0),
  };
}

export interface ItemAtraso {
  parcelaId: string;
  operacaoId: string;
  clienteId: string;
  vencimento: DataISO;
  saldo: Centavos;
  diasAtraso: number;
  /** saldo × dias de atraso — usado para priorizar cobrança. */
  prioridade: number;
}

export function listarAtrasados(c: Carteira, hoje: DataISO): ItemAtraso[] {
  const clientePorOp = new Map(c.operacoes.map((o) => [o.id, o.clienteId]));
  return parcelasEmAberto(c)
    .filter((p) => p.vencimento < hoje)
    .map((p) => {
      const saldo = saldoParcela(p).total;
      const diasAtraso = diferencaDias(p.vencimento, hoje);
      return {
        parcelaId: p.id,
        operacaoId: p.operacaoId,
        clienteId: clientePorOp.get(p.operacaoId)!,
        vencimento: p.vencimento,
        saldo,
        diasAtraso,
        prioridade: saldo * diasAtraso,
      };
    })
    .sort((a, b) => b.prioridade - a.prioridade);
}

export interface SemanaFluxo {
  inicio: DataISO;
  fim: DataISO;
  emDia: Centavos;
  /** Saldo já vencido e não pago (concentrado na semana atual). */
  vencido: Centavos;
}

/** Fluxo projetado por semana (segunda a domingo), começando na semana de `hoje`. */
export function fluxoProjetado(c: Carteira, hoje: DataISO, semanas = 8): SemanaFluxo[] {
  const abertas = parcelasEmAberto(c);
  const primeira = inicioSemana(hoje);
  return Array.from({ length: semanas }, (_, i) => {
    const inicio = somarDias(primeira, 7 * i);
    const fim = somarDias(inicio, 6);
    const emDia = abertas
      .filter((p) => p.vencimento >= hoje && dentroDoPeriodo(p.vencimento, inicio, fim))
      .reduce((a, p) => a + saldoParcela(p).total, 0);
    const vencido =
      i === 0
        ? abertas.filter((p) => p.vencimento < hoje).reduce((a, p) => a + saldoParcela(p).total, 0)
        : 0;
    return { inicio, fim, emDia, vencido };
  });
}

export interface MetricasCliente {
  totalEmprestado: Centavos;
  totalRecebido: Centavos;
  saldoAtual: Centavos;
  operacoes: number;
  operacoesEmAberto: number;
  /** Parcelas pagas até o vencimento ÷ parcelas que já venceram ou foram pagas. Null se não há base. */
  percentualPagoEmDia: number | null;
  /** Média de dias de atraso (pagas com atraso + vencidas em aberto). Null se não há base. */
  atrasoMedioDias: number | null;
  renegociacoes: number;
}

/** Data em que a parcela foi quitada (data do último pagamento), se quitada. */
function dataQuitacao(p: ParcelaEstado, pagamentos: readonly PagamentoRegistro[]): DataISO | null {
  if (saldoParcela(p).total > 0) return null;
  const datas = pagamentos.filter((x) => x.parcelaId === p.id).map((x) => x.data).sort();
  return datas[datas.length - 1] ?? null;
}

export function metricasCliente(c: Carteira, clienteId: string, hoje: DataISO): MetricasCliente {
  const ops = c.operacoes.filter((o) => o.clienteId === clienteId && o.status !== 'cancelada');
  const opIds = new Set(ops.map((o) => o.id));
  const parcelas = c.parcelas.filter((p) => opIds.has(p.operacaoId) && p.status !== 'cancelada');
  const parcelaIds = new Set(parcelas.map((p) => p.id));
  const pagamentos = c.pagamentos.filter((p) => parcelaIds.has(p.parcelaId));
  const abertasIds = new Set(ops.filter((o) => operacaoEmAberto(o.status)).map((o) => o.id));

  let base = 0;
  let emDia = 0;
  const atrasos: number[] = [];
  for (const p of parcelas) {
    const quitadaEm = dataQuitacao(p, pagamentos);
    if (quitadaEm) {
      base++;
      if (quitadaEm <= p.vencimento) emDia++;
      atrasos.push(Math.max(0, diferencaDias(p.vencimento, quitadaEm)));
    } else if (calcularStatusParcela(p, hoje) === 'atrasada') {
      base++;
      atrasos.push(diferencaDias(p.vencimento, hoje));
    }
  }

  return {
    totalEmprestado: ops.reduce((a, o) => a + o.valorPrincipal, 0),
    totalRecebido: pagamentos.reduce((a, p) => a + p.valor, 0),
    saldoAtual: parcelas
      .filter((p) => abertasIds.has(p.operacaoId))
      .reduce((a, p) => a + saldoParcela(p).total, 0),
    operacoes: ops.length,
    operacoesEmAberto: abertasIds.size,
    percentualPagoEmDia: base === 0 ? null : emDia / base,
    atrasoMedioDias: atrasos.length === 0 ? null : atrasos.reduce((a, b) => a + b, 0) / atrasos.length,
    renegociacoes: ops.reduce((a, o) => a + o.renegociacoes, 0),
  };
}

export interface ResumoDiario {
  data: DataISO;
  aReceberHoje: Centavos;
  pessoasHoje: number;
  totalVencido: Centavos;
  topAtrasados: ItemAtraso[];
}

export function resumoDiario(c: Carteira, hoje: DataISO): ResumoDiario {
  const abertas = parcelasEmAberto(c);
  const clientePorOp = new Map(c.operacoes.map((o) => [o.id, o.clienteId]));
  const deHoje = abertas.filter((p) => p.vencimento === hoje);
  const atrasados = listarAtrasados(c, hoje);
  return {
    data: hoje,
    aReceberHoje: deHoje.reduce((a, p) => a + saldoParcela(p).total, 0),
    pessoasHoje: new Set(deHoje.map((p) => clientePorOp.get(p.operacaoId))).size,
    totalVencido: atrasados.reduce((a, x) => a + x.saldo, 0),
    topAtrasados: atrasados.slice(0, 3),
  };
}

/** Parcelas em aberto com vencimento no período (para "quanto entra essa semana?"). */
export function aReceberNoPeriodo(c: Carteira, periodo: Periodo): ParcelaEstado[] {
  return parcelasEmAberto(c)
    .filter((p) => dentroDoPeriodo(p.vencimento, periodo.inicio, periodo.fim))
    .sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0));
}
