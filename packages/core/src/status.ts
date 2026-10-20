import { saldoParcela } from './saldo';
import type { DataISO, OperacaoEstado, ParcelaEstado, StatusOperacao, StatusParcela } from './tipos';

type ParcelaStatusInput = Pick<
  ParcelaEstado,
  | 'vencimento'
  | 'valor'
  | 'valorPrincipal'
  | 'valorJuros'
  | 'valorPago'
  | 'principalPago'
  | 'jurosPago'
  | 'status'
>;

/**
 * Status de uma parcela em `hoje` (data no timezone configurado).
 * Vencimento hoje ainda não é atraso: só vira `atrasada` depois do fim do dia do vencimento.
 */
export function calcularStatusParcela(p: ParcelaStatusInput, hoje: DataISO): StatusParcela {
  if (p.status === 'cancelada') return 'cancelada';
  if (saldoParcela(p).total === 0) return 'paga';
  if (p.vencimento < hoje) return 'atrasada';
  return p.valorPago > 0 ? 'parcial' : 'aberta';
}

const TERMINAIS: readonly StatusOperacao[] = ['perdida', 'cancelada'];

export function calcularStatusOperacao(
  op: Pick<OperacaoEstado, 'status' | 'renegociacoes'>,
  parcelas: readonly ParcelaStatusInput[],
  hoje: DataISO,
): StatusOperacao {
  if (TERMINAIS.includes(op.status)) return op.status;
  const status = parcelas.map((p) => calcularStatusParcela(p, hoje)).filter((s) => s !== 'cancelada');
  if (status.length > 0 && status.every((s) => s === 'paga')) return 'quitada';
  if (status.includes('atrasada')) return 'atrasada';
  if (op.renegociacoes > 0) return 'renegociada';
  return 'ativa';
}

/** Operações que ainda compõem carteira em aberto. */
export function operacaoEmAberto(status: StatusOperacao): boolean {
  return status === 'ativa' || status === 'atrasada' || status === 'renegociada';
}
