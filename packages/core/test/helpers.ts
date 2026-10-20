import type { OperacaoEstado, PagamentoRegistro, ParcelaEstado } from '../src';

let seq = 0;
const id = (p: string) => `${p}-${++seq}`;

export function parcela(over: Partial<ParcelaEstado> = {}): ParcelaEstado {
  const valor = over.valor ?? 1000;
  const valorPrincipal = over.valorPrincipal ?? Math.round(valor * 0.8);
  return {
    id: id('par'),
    operacaoId: 'op-1',
    numero: 1,
    vencimento: '2026-11-10',
    valorPago: 0,
    principalPago: 0,
    jurosPago: 0,
    status: 'aberta',
    ...over,
    valor,
    valorPrincipal,
    valorJuros: over.valorJuros ?? valor - valorPrincipal,
  };
}

export function operacao(over: Partial<OperacaoEstado> = {}): OperacaoEstado {
  return {
    id: id('op'),
    clienteId: 'cli-1',
    dataEmprestimo: '2026-10-01',
    valorPrincipal: 800,
    valorTotalReceber: 1000,
    tipo: 'unica',
    status: 'ativa',
    renegociacoes: 0,
    valorPrejuizo: 0,
    perdidaEm: null,
    ...over,
  };
}

export function pagamento(over: Partial<PagamentoRegistro> & { parcelaId: string }): PagamentoRegistro {
  return {
    id: id('pag'),
    data: '2026-10-15',
    valor: 0,
    valorPrincipalAlocado: 0,
    valorJurosAlocado: 0,
    ...over,
  };
}
