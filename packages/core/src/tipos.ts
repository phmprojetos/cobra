/** Valor monetário em centavos (sempre inteiro). */
export type Centavos = number;

/** Data de calendário `YYYY-MM-DD`, interpretada no timezone configurado. */
export type DataISO = string;

/** Horário local `HH:MM`. */
export type HoraLocal = string;

export type TipoOperacao = 'unica' | 'parcelada';
export type StatusOperacao =
  | 'ativa'
  | 'quitada'
  | 'atrasada'
  | 'renegociada'
  | 'perdida'
  | 'cancelada';
export type StatusParcela = 'aberta' | 'parcial' | 'paga' | 'atrasada' | 'cancelada';
export type Periodicidade = 'semanal' | 'quinzenal' | 'mensal';
export type TipoRegraNotificacao =
  | 'lembrete_antes'
  | 'no_dia'
  | 'atraso'
  | 'resumo_diario'
  | 'resumo_semanal';
export type EstrategiaAlocacaoNome = 'proporcional' | 'juros_primeiro';

export interface ParcelaPlano {
  numero: number;
  vencimento: DataISO;
  valor: Centavos;
  valorPrincipal: Centavos;
  valorJuros: Centavos;
}

/** Estado de uma parcela necessário para cálculos de saldo e alocação. */
export interface ParcelaEstado extends ParcelaPlano {
  id: string;
  operacaoId: string;
  valorPago: Centavos;
  principalPago: Centavos;
  jurosPago: Centavos;
  status: StatusParcela;
}

export interface PagamentoRegistro {
  id: string;
  parcelaId: string;
  data: DataISO;
  valor: Centavos;
  valorPrincipalAlocado: Centavos;
  valorJurosAlocado: Centavos;
}

export interface OperacaoEstado {
  id: string;
  clienteId: string;
  dataEmprestimo: DataISO;
  valorPrincipal: Centavos;
  valorTotalReceber: Centavos;
  tipo: TipoOperacao;
  status: StatusOperacao;
  renegociacoes: number;
  valorPrejuizo: Centavos;
  perdidaEm: DataISO | null;
}

export interface Periodo {
  inicio: DataISO;
  fim: DataISO;
}
