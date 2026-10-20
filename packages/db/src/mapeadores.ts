import type {
  EstrategiaAlocacaoNome,
  HorarioSilencio,
  OperacaoEstado,
  PagamentoRegistro,
  ParcelaEstado,
  RegraNotificacao,
} from '@cobra/core';
import type { Tables } from './database.types';

export type ClienteRow = Tables<'clientes'>;
export type OperacaoRow = Tables<'operacoes'>;
export type ParcelaRow = Tables<'parcelas'>;
export type PagamentoRow = Tables<'pagamentos'>;
export type EventoRow = Tables<'eventos'>;
export type RegraRow = Tables<'regras_notificacao'>;

export function paraOperacao(r: OperacaoRow): OperacaoEstado {
  return {
    id: r.id,
    clienteId: r.cliente_id,
    dataEmprestimo: r.data_emprestimo,
    valorPrincipal: r.valor_principal,
    valorTotalReceber: r.valor_total_receber,
    tipo: r.tipo,
    status: r.status,
    renegociacoes: r.renegociacoes,
    valorPrejuizo: r.valor_prejuizo,
    perdidaEm: r.perdida_em,
  };
}

export function paraParcela(r: ParcelaRow): ParcelaEstado {
  return {
    id: r.id,
    operacaoId: r.operacao_id,
    numero: r.numero,
    vencimento: r.vencimento,
    valor: r.valor,
    valorPrincipal: r.valor_principal,
    valorJuros: r.valor_juros,
    valorPago: r.valor_pago,
    principalPago: r.principal_pago,
    jurosPago: r.juros_pago,
    status: r.status,
  };
}

export function paraPagamento(r: PagamentoRow): PagamentoRegistro {
  return {
    id: r.id,
    parcelaId: r.parcela_id,
    data: r.data,
    valor: r.valor,
    valorPrincipalAlocado: r.valor_principal_alocado,
    valorJurosAlocado: r.valor_juros_alocado,
  };
}

export function paraRegra(r: RegraRow): RegraNotificacao {
  return {
    id: r.id,
    tipo: r.tipo,
    offsetDias: r.offset_dias,
    horario: r.horario.slice(0, 5),
    diaSemana: r.dia_semana,
    ativo: r.ativo,
    silenciarClientes: r.silenciar_clientes,
  };
}

export interface Configuracao {
  moeda: string;
  locale: string;
  timezone: string;
  silencio: HorarioSilencio | null;
  estrategiaAlocacao: EstrategiaAlocacaoNome;
}

export const CONFIG_PADRAO: Configuracao = {
  moeda: 'BRL',
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  silencio: { inicio: '22:00', fim: '07:00' },
  estrategiaAlocacao: 'proporcional',
};

/** Tabela `configuracoes` tem precedência; depois env; depois padrão. */
export function montarConfiguracao(
  linhas: readonly { chave: string; valor: unknown }[],
  env: Partial<Record<'MOEDA' | 'LOCALE' | 'TIMEZONE', string | undefined>> = {},
): Configuracao {
  const m = new Map(linhas.map((l) => [l.chave, l.valor]));
  const str = (k: string, e: string | undefined, d: string) => {
    const v = m.get(k);
    return typeof v === 'string' && v ? v : e || d;
  };
  const silencio = m.get('horario_silencio') as HorarioSilencio | null | undefined;
  const estrategia = m.get('estrategia_alocacao');
  // Valores inválidos (moeda/locale/timezone) nunca derrubam o sistema: caem no padrão.
  const valido = (fn: () => unknown) => {
    try {
      fn();
      return true;
    } catch {
      return false;
    }
  };
  const moeda = str('moeda', env.MOEDA, CONFIG_PADRAO.moeda);
  const locale = str('locale', env.LOCALE, CONFIG_PADRAO.locale);
  const timezone = str('timezone', env.TIMEZONE, CONFIG_PADRAO.timezone);
  return {
    moeda: valido(() => new Intl.NumberFormat(locale, { style: 'currency', currency: moeda })) ? moeda : CONFIG_PADRAO.moeda,
    locale: valido(() => new Intl.NumberFormat(locale)) ? locale : CONFIG_PADRAO.locale,
    timezone: valido(() => new Intl.DateTimeFormat('en', { timeZone: timezone })) ? timezone : CONFIG_PADRAO.timezone,
    silencio: silencio === undefined ? CONFIG_PADRAO.silencio : silencio,
    estrategiaAlocacao: estrategia === 'juros_primeiro' ? 'juros_primeiro' : 'proporcional',
  };
}
