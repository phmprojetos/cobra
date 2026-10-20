import { assertCentavos } from './dinheiro';
import { ErroRegra } from './erros';
import { saldoParcela, somarSaldos } from './saldo';
import type { Centavos, DataISO, ParcelaEstado } from './tipos';

export interface AlteracaoParcela {
  novoVencimento?: DataISO;
  /** Valor somado à parcela (tratado como juros adicionais). Pode ser negativo (desconto). */
  acrescimo?: Centavos;
}

export interface CamposRenegociaveis {
  vencimento: DataISO;
  valor: Centavos;
  valorJuros: Centavos;
}

export interface ResultadoRenegociacao {
  depois: CamposRenegociaveis;
  /** Payload para a tabela `eventos`, preservando o valor anterior. */
  evento: {
    acao: 'prorrogar' | 'renegociar';
    payload: { antes: CamposRenegociaveis; depois: CamposRenegociaveis; acrescimo: Centavos };
  };
  /** Se o valor mudou — nesse caso a operação passa a contar como renegociada. */
  alterouValor: boolean;
}

/**
 * Prorroga e/ou altera o valor de uma parcela. O acréscimo entra como juros:
 * o principal emprestado não muda numa renegociação.
 */
export function renegociarParcela(
  p: ParcelaEstado,
  alteracao: AlteracaoParcela,
): ResultadoRenegociacao {
  const acrescimo = alteracao.acrescimo ?? 0;
  assertCentavos(acrescimo, 'acréscimo');
  if (p.status === 'cancelada' || saldoParcela(p).total === 0) {
    throw new ErroRegra('parcela_fechada', 'Esta parcela já está paga ou cancelada');
  }
  if (!alteracao.novoVencimento && acrescimo === 0) {
    throw new ErroRegra('sem_alteracao', 'Informe nova data ou novo valor');
  }
  const antes: CamposRenegociaveis = {
    vencimento: p.vencimento,
    valor: p.valor,
    valorJuros: p.valorJuros,
  };
  const depois: CamposRenegociaveis = {
    vencimento: alteracao.novoVencimento ?? p.vencimento,
    valor: p.valor + acrescimo,
    valorJuros: p.valorJuros + acrescimo,
  };
  if (depois.valorJuros < p.jurosPago || depois.valor < p.valorPago) {
    throw new ErroRegra('desconto_excessivo', 'O desconto é maior que o saldo de juros da parcela');
  }
  const alterouValor = acrescimo !== 0;
  return {
    depois,
    evento: { acao: alterouValor ? 'renegociar' : 'prorrogar', payload: { antes, depois, acrescimo } },
    alterouValor,
  };
}

export interface ResultadoPerda {
  /** Prejuízo registrado: principal ainda não recuperado. */
  prejuizo: Centavos;
  principalEmAberto: Centavos;
  /** Juros que deixam de ser recebidos (não entram no prejuízo). */
  jurosNaoRecebidos: Centavos;
}

export function calcularPerda(parcelas: readonly ParcelaEstado[]): ResultadoPerda {
  const s = somarSaldos(parcelas.map(saldoParcela));
  if (s.total === 0) {
    throw new ErroRegra('sem_saldo', 'Operação sem saldo em aberto não pode ser marcada como perda');
  }
  return { prejuizo: s.principal, principalEmAberto: s.principal, jurosNaoRecebidos: s.juros };
}
