import { describe, expect, it } from 'vitest';
import { calcularPerda, renegociarParcela } from '../src';
import { parcela } from './helpers';

describe('renegociarParcela', () => {
  const p = parcela({ vencimento: '2026-12-15', valor: 240000, valorPrincipal: 200000 });

  it('"joga o vencimento do Carlos pro dia 30 com mais 100"', () => {
    const r = renegociarParcela(p, { novoVencimento: '2026-12-30', acrescimo: 10000 });
    expect(r.depois).toEqual({ vencimento: '2026-12-30', valor: 250000, valorJuros: 50000 });
    expect(r.alterouValor).toBe(true);
    expect(r.evento.acao).toBe('renegociar');
    expect(r.evento.payload.antes).toEqual({ vencimento: '2026-12-15', valor: 240000, valorJuros: 40000 });
  });

  it('só prorrogar não altera valor', () => {
    const r = renegociarParcela(p, { novoVencimento: '2026-12-20' });
    expect(r.alterouValor).toBe(false);
    expect(r.evento.acao).toBe('prorrogar');
    expect(r.depois.valor).toBe(240000);
  });

  it('desconto limitado aos juros não pagos', () => {
    expect(renegociarParcela(p, { acrescimo: -40000 }).depois.valorJuros).toBe(0);
    expect(() => renegociarParcela(p, { acrescimo: -40001 })).toThrow(/desconto/);
  });

  it('rejeita parcela fechada ou alteração vazia', () => {
    expect(() => renegociarParcela(parcela({ status: 'cancelada' }), { acrescimo: 1 })).toThrow(/paga ou cancelada/);
    expect(() => renegociarParcela(p, {})).toThrow(/Informe/);
    expect(() => renegociarParcela(p, { acrescimo: 0.5 })).toThrow(/centavos/);
  });
});

describe('calcularPerda', () => {
  it('prejuízo = principal em aberto', () => {
    const ps = [
      parcela({ valor: 15000, valorPrincipal: 12500, valorPago: 15000, principalPago: 12500, jurosPago: 2500 }),
      parcela({ valor: 15000, valorPrincipal: 12500, valorPago: 6000, principalPago: 5000, jurosPago: 1000 }),
      parcela({ valor: 15000, valorPrincipal: 12500 }),
    ];
    expect(calcularPerda(ps)).toEqual({ prejuizo: 20000, principalEmAberto: 20000, jurosNaoRecebidos: 4000 });
  });
  it('rejeita operação sem saldo', () => {
    expect(() => calcularPerda([])).toThrow(/sem saldo/);
  });
});
