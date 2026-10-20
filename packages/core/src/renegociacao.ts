import { assertCentavos } from './dinheiro';
import { diferencaDias, somarDias, somarMeses } from './datas';
import { ErroRegra } from './erros';
import { saldoParcela, somarSaldos } from './saldo';
import type { Centavos, DataISO, ParcelaEstado, ParcelaPlano } from './tipos';

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

// ───────────────────────── renovação (pagou só os juros) ─────────────────────────

/**
 * Próximo vencimento ao renovar: contrato de "dia fixo" (vence no mesmo dia do mês em que foi
 * emprestado) vai para o mesmo dia do mês seguinte; senão soma o mesmo prazo em dias.
 * Conta a partir do vencimento (não da data em que pagou).
 */
export function vencimentoRenovacao(vencimentoAtual: DataISO, dataEmprestimo: DataISO, primeiroVencimento: DataISO): DataISO {
  if (dataEmprestimo.slice(8) === primeiroVencimento.slice(8)) return somarMeses(vencimentoAtual, 1);
  return somarDias(vencimentoAtual, Math.max(1, diferencaDias(dataEmprestimo, primeiroVencimento)));
}

export interface EntradaRenovacao {
  parcela: ParcelaEstado;
  /** Valor pago agora: cobre os juros em aberto; o que passar abate o principal. */
  valorPago: Centavos;
  novoVencimento: DataISO;
  /** Número da nova parcela (maior número da operação + 1). */
  numeroNova: number;
}

export interface ResultadoRenovacao {
  /** Alocação do pagamento: juros primeiro, sobra no principal. */
  pagamento: { valor: Centavos; principal: Centavos; juros: Centavos };
  /** A parcela atual fecha com exatamente o que foi pago nela (fica quitada). */
  parcelaFechada: { valor: Centavos; valorPrincipal: Centavos; valorJuros: Centavos };
  /** Nova parcela: principal que sobrou + juros do período sobre ele (mesma taxa da parcela). */
  novaParcela: ParcelaPlano;
  taxaDoPeriodo: number;
}

/**
 * "Pegou 100 com 30 de juros e na data pagou só os 30": os 30 quitam os juros, a parcela
 * fecha e nasce outra de 130 (100 + 30) no próximo vencimento. Pagando mais que os juros,
 * o excedente amortiza o principal e os juros seguintes são calculados sobre o que sobrou.
 */
export function renovarPagandoJuros(e: EntradaRenovacao): ResultadoRenovacao {
  const { parcela: p, valorPago } = e;
  assertCentavos(valorPago, 'valor pago');
  if (p.status === 'cancelada') throw new ErroRegra('parcela_fechada', 'Esta parcela está cancelada');
  const saldo = saldoParcela(p);
  if (saldo.total === 0) throw new ErroRegra('parcela_fechada', 'Esta parcela já está paga');
  if (p.valorPrincipal <= 0) throw new ErroRegra('sem_principal', 'Parcela sem principal não pode ser renovada');
  if (valorPago < saldo.juros) {
    throw new ErroRegra('abaixo_dos_juros', 'Para renovar, o pagamento precisa cobrir ao menos os juros da parcela');
  }
  if (valorPago >= saldo.total) {
    throw new ErroRegra('quita', 'Esse valor quita a parcela: registre como pagamento normal');
  }
  if (e.novoVencimento <= p.vencimento) {
    throw new ErroRegra('vencimento_invalido', 'O novo vencimento precisa ser depois do atual');
  }
  const juros = saldo.juros;
  const principal = valorPago - juros;
  const principalRestante = saldo.principal - principal;
  const taxaDoPeriodo = p.valorJuros / p.valorPrincipal;
  const jurosNovos = Math.round(principalRestante * taxaDoPeriodo);
  return {
    pagamento: { valor: valorPago, principal, juros },
    parcelaFechada: {
      valor: p.valorPago + valorPago,
      valorPrincipal: p.principalPago + principal,
      valorJuros: p.jurosPago + juros,
    },
    novaParcela: {
      numero: e.numeroNova,
      vencimento: e.novoVencimento,
      valor: principalRestante + jurosNovos,
      valorPrincipal: principalRestante,
      valorJuros: jurosNovos,
    },
    taxaDoPeriodo,
  };
}
