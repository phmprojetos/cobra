import { assertCentavos, dividirIgual } from './dinheiro';
import { compararDatas, somarDias, somarMeses } from './datas';
import { ErroRegra } from './erros';
import type { Centavos, DataISO, ParcelaPlano, Periodicidade } from './tipos';

export function vencimentoDaParcela(
  primeiro: DataISO,
  indice: number,
  periodicidade: Periodicidade,
): DataISO {
  switch (periodicidade) {
    case 'semanal':
      return somarDias(primeiro, 7 * indice);
    case 'quinzenal':
      return somarDias(primeiro, 15 * indice);
    case 'mensal':
      return somarMeses(primeiro, indice);
  }
}

/**
 * Reparte `valores` entre principal e juros na proporção principal/total da operação.
 * O principal da última parcela absorve o arredondamento, garantindo soma exata.
 */
export function repartirPrincipalJuros(
  valores: readonly Centavos[],
  principal: Centavos,
): { valorPrincipal: Centavos; valorJuros: Centavos }[] {
  const total = valores.reduce((a, b) => a + b, 0);
  let principalRestante = principal;
  return valores.map((valor, i) => {
    const valorPrincipal =
      i === valores.length - 1 ? principalRestante : Math.round((valor * principal) / total);
    principalRestante -= valorPrincipal;
    return { valorPrincipal, valorJuros: valor - valorPrincipal };
  });
}

export interface EntradaParcelamento {
  dataEmprestimo: DataISO;
  principal: Centavos;
  totalReceber: Centavos;
  numeroParcelas: number;
  primeiroVencimento: DataISO;
  periodicidade: Periodicidade;
}

/** Gera N parcelas iguais (ajuste de centavos na última). N = 1 é parcela única. */
export function gerarParcelas(e: EntradaParcelamento): ParcelaPlano[] {
  assertCentavos(e.principal, 'principal');
  assertCentavos(e.totalReceber, 'total a receber');
  if (e.principal <= 0) throw new ErroRegra('principal_invalido', 'Principal deve ser positivo');
  if (e.totalReceber < e.principal) {
    throw new ErroRegra(
      'total_menor_que_principal',
      'O total a receber não pode ser menor que o valor emprestado',
    );
  }
  if (compararDatas(e.primeiroVencimento, e.dataEmprestimo) <= 0) {
    throw new ErroRegra(
      'vencimento_invalido',
      'O primeiro vencimento deve ser depois da data do empréstimo',
    );
  }
  const valores = dividirIgual(e.totalReceber, e.numeroParcelas);
  const reparticao = repartirPrincipalJuros(valores, e.principal);
  return valores.map((valor, i) => ({
    numero: i + 1,
    vencimento: vencimentoDaParcela(e.primeiroVencimento, i, e.periodicidade),
    valor,
    valorPrincipal: reparticao[i]!.valorPrincipal,
    valorJuros: reparticao[i]!.valorJuros,
  }));
}
