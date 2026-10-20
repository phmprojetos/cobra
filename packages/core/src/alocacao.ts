import { assertCentavos } from './dinheiro';
import { ErroRegra } from './erros';
import { saldoParcela, type Saldo } from './saldo';
import type { Centavos, EstrategiaAlocacaoNome, ParcelaEstado } from './tipos';

/** Decide como um valor (≤ saldo da parcela) se divide entre principal e juros. */
export interface EstrategiaAlocacao {
  readonly nome: EstrategiaAlocacaoNome;
  dividir(valor: Centavos, saldo: Saldo): { principal: Centavos; juros: Centavos };
}

export const alocacaoProporcional: EstrategiaAlocacao = {
  nome: 'proporcional',
  dividir(valor, saldo) {
    if (valor >= saldo.total) return { principal: saldo.principal, juros: saldo.juros };
    const principal = Math.round((valor * saldo.principal) / saldo.total);
    return { principal, juros: valor - principal };
  },
};

export const alocacaoJurosPrimeiro: EstrategiaAlocacao = {
  nome: 'juros_primeiro',
  dividir(valor, saldo) {
    const juros = Math.min(valor, saldo.juros);
    return { principal: Math.min(valor - juros, saldo.principal), juros };
  },
};

export function estrategiaPorNome(nome: EstrategiaAlocacaoNome): EstrategiaAlocacao {
  return nome === 'juros_primeiro' ? alocacaoJurosPrimeiro : alocacaoProporcional;
}

export interface Alocacao {
  parcelaId: string;
  operacaoId: string;
  numero: number;
  valor: Centavos;
  principal: Centavos;
  juros: Centavos;
  /** Se após este pagamento a parcela fica totalmente paga. */
  quita: boolean;
}

export interface ResultadoAlocacao {
  alocacoes: Alocacao[];
  /** Valor que sobrou após quitar todas as parcelas informadas. */
  excedente: Centavos;
}

/**
 * Distribui um pagamento pelas parcelas em aberto, da mais antiga para a mais nova.
 * O que excede uma parcela abate a próxima.
 */
export function alocarPagamento(
  valor: Centavos,
  parcelas: readonly ParcelaEstado[],
  estrategia: EstrategiaAlocacao = alocacaoProporcional,
): ResultadoAlocacao {
  assertCentavos(valor);
  if (valor <= 0) throw new ErroRegra('valor_invalido', 'O valor do pagamento deve ser positivo');

  const abertas = parcelas
    .filter((p) => saldoParcela(p).total > 0)
    .sort((a, b) =>
      a.vencimento === b.vencimento ? a.numero - b.numero : a.vencimento < b.vencimento ? -1 : 1,
    );

  let restante = valor;
  const alocacoes: Alocacao[] = [];
  for (const p of abertas) {
    if (restante === 0) break;
    const saldo = saldoParcela(p);
    const aplicado = Math.min(restante, saldo.total);
    const { principal, juros } = estrategia.dividir(aplicado, saldo);
    alocacoes.push({
      parcelaId: p.id,
      operacaoId: p.operacaoId,
      numero: p.numero,
      valor: aplicado,
      principal,
      juros,
      quita: aplicado === saldo.total,
    });
    restante -= aplicado;
  }
  return { alocacoes, excedente: restante };
}
