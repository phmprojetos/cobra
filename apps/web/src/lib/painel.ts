import 'server-only';
import {
  dentroDoPeriodo,
  formatarMoeda,
  formatarPercentual,
  operacaoEmAberto,
  saldoParcela,
  somarDias,
  somarMeses,
  type Centavos,
  type DataISO,
  type Periodo,
} from '@cobra/core';
import { Repositorio, type CarteiraCompleta, type Configuracao, type OperacaoRow } from '@cobra/db';
import { fonteDemo, MODO_DEMO } from './demo';
import { dbPainel } from './supabase/painel';

export type SearchParams = Record<string, string | string[] | undefined>;

export const PRESETS = {
  mes: 'Este mês',
  mes_passado: 'Mês passado',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  ano: 'Este ano',
  tudo: 'Tudo',
} as const;
export type Preset = keyof typeof PRESETS | 'custom';

function param(sp: SearchParams, k: string): string | undefined {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Período global vindo da URL (?p=mes | ?de=YYYY-MM-DD&ate=YYYY-MM-DD). */
export function lerPeriodo(sp: SearchParams, hoje: DataISO): { periodo: Periodo; preset: Preset } {
  const de = param(sp, 'de');
  const ate = param(sp, 'ate');
  if (de && ate && RE_DATA.test(de) && RE_DATA.test(ate)) {
    return { periodo: de <= ate ? { inicio: de, fim: ate } : { inicio: ate, fim: de }, preset: 'custom' };
  }
  const p = (param(sp, 'p') ?? 'mes') as Preset;
  const inicioMes = `${hoje.slice(0, 8)}01`;
  switch (p) {
    case 'mes_passado': {
      const inicio = somarMeses(inicioMes, -1);
      return { periodo: { inicio, fim: somarDias(inicioMes, -1) }, preset: p };
    }
    case '30d':
      return { periodo: { inicio: somarDias(hoje, -29), fim: hoje }, preset: p };
    case '90d':
      return { periodo: { inicio: somarDias(hoje, -89), fim: hoje }, preset: p };
    case 'ano':
      return { periodo: { inicio: `${hoje.slice(0, 4)}-01-01`, fim: `${hoje.slice(0, 4)}-12-31` }, preset: p };
    case 'tudo':
      return { periodo: { inicio: '2000-01-01', fim: '2100-12-31' }, preset: p };
    default:
      return { periodo: { inicio: inicioMes, fim: somarDias(somarMeses(inicioMes, 1), -1) }, preset: 'mes' };
  }
}

export class Fmt {
  constructor(private readonly c: Pick<Configuracao, 'moeda' | 'locale'>) {}
  dinheiro = (v: Centavos) => formatarMoeda(v, this.c);
  pct = (v: number) => formatarPercentual(v, this.c.locale, 1);
  data = (d: DataISO) => {
    const [a, m, dia] = d.split('-');
    return `${dia}/${m}/${a}`;
  };
  dataCurta = (d: DataISO) => {
    const [, m, dia] = d.split('-');
    return `${dia}/${m}`;
  };
}

/** O que as páginas leem: Supabase (RLS do usuário) ou, com DEMO=1, a carteira fictícia em memória. */
export type Fonte = Pick<Repositorio, 'configuracao' | 'hoje' | 'regras' | 'eventos' | 'carregarCarteira'>;

export async function fonte(): Promise<Fonte> {
  return MODO_DEMO ? fonteDemo : new Repositorio(await dbPainel());
}

export async function carregarPainel(sp: SearchParams = {}) {
  const repo = await fonte();
  const [config, carteira] = await Promise.all([repo.configuracao(), repo.carregarCarteira()]);
  const hoje = await repo.hoje();
  const { periodo, preset } = lerPeriodo(sp, hoje);
  return { repo, config, carteira, hoje, periodo, preset, fmt: new Fmt(config) };
}

// ─────────────────────────── drill-down dos números ───────────────────────────

/** Filtros de lista que cada número do painel abre. */
export const FILTROS = {
  capital: 'Capital na rua',
  areceber: 'Total a receber',
  '7dias': 'A receber em 7 dias',
  vencido: 'Vencido',
  lucro_realizado: 'Lucro realizado no período',
  lucro_a_realizar: 'Lucro a realizar no período',
  prejuizo: 'Prejuízo no período',
} as const;
export type Filtro = keyof typeof FILTROS;

export interface CriteriosOperacoes {
  filtro?: Filtro;
  status?: string;
  clienteId?: string;
  /** Semana do fluxo projetado (início, segunda-feira) e qual parte da barra. */
  semana?: DataISO;
  parte?: 'emdia' | 'vencido';
  /** Período do filtro global, aplicado à data do empréstimo quando não há outro filtro. */
  periodoEmprestimo?: Periodo;
}

export function filtrarOperacoes(c: CarteiraCompleta, hoje: DataISO, periodo: Periodo, k: CriteriosOperacoes): OperacaoRow[] {
  const comSaldo = (opId: string, pred: (venc: DataISO) => boolean) =>
    c.carteira.parcelas.some((p) => p.operacaoId === opId && saldoParcela(p).total > 0 && pred(p.vencimento));
  return c.operacoes.filter((o) => {
    if (k.status && o.status !== k.status) return false;
    if (k.clienteId && o.cliente_id !== k.clienteId) return false;
    const aberta = operacaoEmAberto(o.status);
    if (k.semana) {
      const fim = somarDias(k.semana, 6);
      if (!aberta) return false;
      return k.parte === 'vencido'
        ? comSaldo(o.id, (v) => v < hoje)
        : comSaldo(o.id, (v) => v >= hoje && dentroDoPeriodo(v, k.semana!, fim));
    }
    switch (k.filtro) {
      case 'capital':
      case 'areceber':
        return aberta && comSaldo(o.id, () => true);
      case '7dias':
        return aberta && comSaldo(o.id, (v) => dentroDoPeriodo(v, hoje, somarDias(hoje, 6)));
      case 'vencido':
        return aberta && comSaldo(o.id, (v) => v < hoje);
      case 'lucro_realizado': {
        const parcelas = new Set(c.parcelas.filter((p) => p.operacao_id === o.id).map((p) => p.id));
        return c.pagamentos.some((p) => parcelas.has(p.parcela_id) && p.valor_juros_alocado > 0 && dentroDoPeriodo(p.data, periodo.inicio, periodo.fim));
      }
      case 'lucro_a_realizar':
        return aberta && comSaldo(o.id, (v) => dentroDoPeriodo(v, periodo.inicio, periodo.fim));
      case 'prejuizo':
        return o.status === 'perdida' && !!o.perdida_em && dentroDoPeriodo(o.perdida_em, periodo.inicio, periodo.fim);
      default:
        return k.periodoEmprestimo ? dentroDoPeriodo(o.data_emprestimo, k.periodoEmprestimo.inicio, k.periodoEmprestimo.fim) : true;
    }
  });
}

export function saldoOperacao(c: CarteiraCompleta, opId: string): Centavos {
  return c.carteira.parcelas.filter((p) => p.operacaoId === opId).reduce((a, p) => a + saldoParcela(p).total, 0);
}

export function proximoVencimento(c: CarteiraCompleta, opId: string): DataISO | null {
  const v = c.carteira.parcelas
    .filter((p) => p.operacaoId === opId && saldoParcela(p).total > 0)
    .map((p) => p.vencimento)
    .sort();
  return v[0] ?? null;
}

/** Monta query string preservando o período global. */
export function comPeriodo(sp: SearchParams, extra: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const k of ['p', 'de', 'ate']) {
    const v = param(sp, k);
    if (v) q.set(k, v);
  }
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export { param };
