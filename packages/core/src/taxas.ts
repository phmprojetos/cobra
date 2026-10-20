import { soma } from './dinheiro';
import { diferencaDias } from './datas';
import { ErroRegra } from './erros';
import type { Centavos, DataISO } from './tipos';

export interface Fluxo {
  /** Dias desde a data do empréstimo. */
  dias: number;
  /** Positivo = recebimento; negativo = desembolso. */
  valor: number;
}

/** Taxa do período inteiro: total / principal − 1. */
export function taxaPeriodo(principal: Centavos, total: Centavos): number {
  if (principal <= 0) throw new ErroRegra('principal_invalido', 'Principal deve ser positivo');
  return total / principal - 1;
}

/** Taxa mensal (30 dias) equivalente em juros compostos para parcela única. */
export function taxaMensalEquivalente(principal: Centavos, total: Centavos, dias: number): number {
  if (dias <= 0) throw new ErroRegra('prazo_invalido', 'Prazo deve ser de pelo menos 1 dia');
  return Math.pow(total / principal, 30 / dias) - 1;
}

function vpl(fluxos: readonly Fluxo[], taxa: number): number {
  return fluxos.reduce((acc, f) => acc + f.valor / Math.pow(1 + taxa, f.dias / 30), 0);
}

/**
 * TIR mensal (base 30 dias) de um conjunto de fluxos.
 * Usa bissecção — robusta e suficiente para o tamanho dos problemas aqui.
 */
export function tirMensal(fluxos: readonly Fluxo[]): number {
  if (!fluxos.some((f) => f.valor < 0) || !fluxos.some((f) => f.valor > 0)) {
    throw new ErroRegra('fluxo_invalido', 'TIR exige desembolso e recebimento');
  }
  let baixo = -0.9999;
  let alto = 1;
  // Expande o limite superior até haver troca de sinal (taxas altas são comuns aqui).
  while (vpl(fluxos, alto) > 0) {
    alto *= 2;
    if (alto > 1e6) throw new ErroRegra('tir_nao_converge', 'Não foi possível calcular a taxa');
  }
  for (let i = 0; i < 200; i++) {
    const meio = (baixo + alto) / 2;
    if (vpl(fluxos, meio) > 0) baixo = meio;
    else alto = meio;
    if (alto - baixo < 1e-12) break;
  }
  return (baixo + alto) / 2;
}

export interface IndicadoresOperacao {
  jurosTotal: Centavos;
  prazoDias: number;
  taxaPeriodo: number;
  /** Taxa efetiva mensal (TIR normalizada para 30 dias). */
  taxaEfetivaMensal: number;
}

export function calcularIndicadores(input: {
  dataEmprestimo: DataISO;
  principal: Centavos;
  parcelas: readonly { vencimento: DataISO; valor: Centavos }[];
}): IndicadoresOperacao {
  const { dataEmprestimo, principal, parcelas } = input;
  if (parcelas.length === 0) throw new ErroRegra('sem_parcelas', 'Operação sem parcelas');
  const total = soma(parcelas.map((p) => p.valor));
  const fluxos: Fluxo[] = [
    { dias: 0, valor: -principal },
    ...parcelas.map((p) => ({ dias: diferencaDias(dataEmprestimo, p.vencimento), valor: p.valor })),
  ];
  const prazoDias = Math.max(...fluxos.map((f) => f.dias));
  if (prazoDias <= 0) {
    throw new ErroRegra('prazo_invalido', 'O vencimento deve ser depois da data do empréstimo');
  }
  const taxaEfetivaMensal =
    parcelas.length === 1
      ? taxaMensalEquivalente(principal, total, prazoDias)
      : tirMensal(fluxos);
  return {
    jurosTotal: total - principal,
    prazoDias,
    taxaPeriodo: taxaPeriodo(principal, total),
    taxaEfetivaMensal,
  };
}
