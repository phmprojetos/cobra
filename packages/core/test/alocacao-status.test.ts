import { describe, expect, it } from 'vitest';
import {
  alocacaoJurosPrimeiro,
  alocacaoProporcional,
  alocarPagamento,
  calcularStatusOperacao,
  calcularStatusParcela,
  estrategiaPorNome,
  operacaoEmAberto,
  saldoParcela,
} from '../src';
import { parcela } from './helpers';

describe('saldoParcela', () => {
  it('desconta pagamentos', () => {
    expect(saldoParcela(parcela({ valor: 1000, principalPago: 400, jurosPago: 100, valorPago: 500 }))).toEqual({
      total: 500,
      principal: 400,
      juros: 100,
    });
  });
  it('cancelada tem saldo zero', () => {
    expect(saldoParcela(parcela({ status: 'cancelada' })).total).toBe(0);
  });
});

describe('alocarPagamento — proporcional', () => {
  // "Carlos pagou 1200" numa operação de 2000 → 2400
  const p = parcela({ id: 'p1', valor: 240000, valorPrincipal: 200000 });

  it('pagamento parcial divide na proporção principal/juros', () => {
    const r = alocarPagamento(120000, [p]);
    expect(r.excedente).toBe(0);
    expect(r.alocacoes).toEqual([
      expect.objectContaining({ parcelaId: 'p1', valor: 120000, principal: 100000, juros: 20000, quita: false }),
    ]);
  });

  it('pagamento exato quita com o saldo remanescente exato', () => {
    const parcialmentePaga = parcela({
      valor: 1000,
      valorPrincipal: 333,
      valorPago: 1,
      principalPago: 0,
      jurosPago: 1,
    });
    const r = alocarPagamento(999, [parcialmentePaga]);
    expect(r.alocacoes[0]).toMatchObject({ principal: 333, juros: 666, quita: true });
  });

  it('centavos: arredondamento não ultrapassa o saldo', () => {
    const r = alocarPagamento(1, [parcela({ valor: 3, valorPrincipal: 2 })]);
    expect(r.alocacoes[0]!.principal + r.alocacoes[0]!.juros).toBe(1);
  });

  it('pagamento acima da parcela abate a próxima, na ordem de vencimento', () => {
    const p1 = parcela({ id: 'a', numero: 1, vencimento: '2026-10-23', valor: 15000, valorPrincipal: 12500 });
    const p2 = parcela({ id: 'b', numero: 2, vencimento: '2026-10-30', valor: 15000, valorPrincipal: 12500 });
    const p3 = parcela({ id: 'c', numero: 3, vencimento: '2026-11-06', valor: 15000, valorPrincipal: 12500 });
    expect(alocarPagamento(20000, [p1, p3, p2]).alocacoes.map((a) => a.parcelaId)).toEqual(['a', 'b']);
    const r = alocarPagamento(20000, [p3, p2, p1]);
    expect(r.alocacoes.map((a) => [a.parcelaId, a.valor, a.quita])).toEqual([
      ['a', 15000, true],
      ['b', 5000, false],
    ]);
    expect(r.excedente).toBe(0);
  });

  it('mesmo vencimento ordena pelo número', () => {
    const p1 = parcela({ id: 'x', numero: 2 });
    const p2 = parcela({ id: 'y', numero: 1 });
    expect(alocarPagamento(10, [p1, p2]).alocacoes[0]!.parcelaId).toBe('y');
    expect(alocarPagamento(10, [p2, p1]).alocacoes[0]!.parcelaId).toBe('y');
  });

  it('ignora parcelas pagas/canceladas e devolve excedente', () => {
    const paga = parcela({ valor: 100, valorPrincipal: 80, valorPago: 100, principalPago: 80, jurosPago: 20 });
    const cancelada = parcela({ status: 'cancelada' });
    const aberta = parcela({ id: 'ok', valor: 100, valorPrincipal: 80 });
    const r = alocarPagamento(150, [paga, cancelada, aberta]);
    expect(r.alocacoes).toHaveLength(1);
    expect(r.excedente).toBe(50);
  });

  it('rejeita valor inválido', () => {
    expect(() => alocarPagamento(0, [p])).toThrow(/positivo/);
    expect(() => alocarPagamento(1.5, [p])).toThrow(/centavos/);
  });
});

describe('alocarPagamento — juros primeiro', () => {
  const p = parcela({ valor: 240000, valorPrincipal: 200000 });
  it('quita juros antes do principal', () => {
    expect(alocarPagamento(30000, [p], alocacaoJurosPrimeiro).alocacoes[0]).toMatchObject({
      juros: 30000,
      principal: 0,
    });
    expect(alocarPagamento(100000, [p], alocacaoJurosPrimeiro).alocacoes[0]).toMatchObject({
      juros: 40000,
      principal: 60000,
    });
  });
  it('estrategiaPorNome', () => {
    expect(estrategiaPorNome('juros_primeiro')).toBe(alocacaoJurosPrimeiro);
    expect(estrategiaPorNome('proporcional')).toBe(alocacaoProporcional);
  });
});

describe('status', () => {
  const hoje = '2026-10-20';

  it('parcela vencendo hoje não está atrasada', () => {
    expect(calcularStatusParcela(parcela({ vencimento: hoje }), hoje)).toBe('aberta');
  });
  it('vencida ontem e não paga está atrasada', () => {
    expect(calcularStatusParcela(parcela({ vencimento: '2026-10-19' }), hoje)).toBe('atrasada');
  });
  it('parcial antes do vencimento; atrasada depois', () => {
    const p = parcela({ vencimento: hoje, valorPago: 100, principalPago: 80, jurosPago: 20 });
    expect(calcularStatusParcela(p, hoje)).toBe('parcial');
    expect(calcularStatusParcela(p, '2026-10-21')).toBe('atrasada');
  });
  it('paga e cancelada', () => {
    const paga = parcela({ valor: 100, valorPrincipal: 80, valorPago: 100, principalPago: 80, jurosPago: 20 });
    expect(calcularStatusParcela({ ...paga, vencimento: '2020-01-01' }, hoje)).toBe('paga');
    expect(calcularStatusParcela(parcela({ status: 'cancelada' }), hoje)).toBe('cancelada');
  });

  it('mudança de timezone muda o "hoje" e portanto o status', () => {
    // A mesma parcela, vista às 23:30 de 20/10 em SP (= 21/10 em UTC)
    const p = parcela({ vencimento: '2026-10-20' });
    expect(calcularStatusParcela(p, '2026-10-20')).toBe('aberta');
    expect(calcularStatusParcela(p, '2026-10-21')).toBe('atrasada');
  });

  it('operação', () => {
    const paga = parcela({ valor: 100, valorPrincipal: 80, valorPago: 100, principalPago: 80, jurosPago: 20 });
    const atrasada = parcela({ vencimento: '2026-10-01' });
    const futura = parcela({ vencimento: '2026-11-01' });
    const cancelada = parcela({ status: 'cancelada' });
    const op = { status: 'ativa' as const, renegociacoes: 0 };
    expect(calcularStatusOperacao(op, [paga, cancelada], hoje)).toBe('quitada');
    expect(calcularStatusOperacao(op, [paga, atrasada], hoje)).toBe('atrasada');
    expect(calcularStatusOperacao(op, [paga, futura], hoje)).toBe('ativa');
    expect(calcularStatusOperacao({ ...op, renegociacoes: 1 }, [futura], hoje)).toBe('renegociada');
    expect(calcularStatusOperacao({ ...op, renegociacoes: 1 }, [atrasada], hoje)).toBe('atrasada');
    expect(calcularStatusOperacao({ ...op, status: 'perdida' }, [paga], hoje)).toBe('perdida');
    expect(calcularStatusOperacao({ ...op, status: 'cancelada' }, [futura], hoje)).toBe('cancelada');
    expect(calcularStatusOperacao(op, [cancelada], hoje)).toBe('ativa');
  });

  it('operacaoEmAberto', () => {
    expect(['ativa', 'atrasada', 'renegociada'].every((s) => operacaoEmAberto(s as never))).toBe(true);
    expect(['quitada', 'perdida', 'cancelada'].some((s) => operacaoEmAberto(s as never))).toBe(false);
  });
});
