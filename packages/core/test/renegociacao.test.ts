import { describe, expect, it } from 'vitest';
import { calcularPerda, renegociarParcela, renovarPagandoJuros, vencimentoRenovacao } from '../src';
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

describe('renovação: pagou só os juros', () => {
  // Pegou 100, juros de 30: parcela única de 130 vencendo em 20/11
  const p = parcela({ id: 'x', vencimento: '2026-11-20', valor: 13000, valorPrincipal: 10000 });

  it('pagou 30: fecha a parcela com 30 e nasce outra de 130 no mês seguinte', () => {
    const r = renovarPagandoJuros({ parcela: p, valorPago: 3000, novoVencimento: '2026-12-20', numeroNova: 2 });
    expect(r.pagamento).toEqual({ valor: 3000, principal: 0, juros: 3000 });
    expect(r.parcelaFechada).toEqual({ valor: 3000, valorPrincipal: 0, valorJuros: 3000 });
    expect(r.novaParcela).toEqual({ numero: 2, vencimento: '2026-12-20', valor: 13000, valorPrincipal: 10000, valorJuros: 3000 });
    expect(r.taxaDoPeriodo).toBeCloseTo(0.3);
  });

  it('renovando de novo: sempre 130 no mês seguinte', () => {
    let atual = p;
    for (let i = 0; i < 3; i++) {
      const venc = vencimentoRenovacao(atual.vencimento, '2026-10-20', '2026-11-20');
      const r = renovarPagandoJuros({ parcela: atual, valorPago: 3000, novoVencimento: venc, numeroNova: i + 2 });
      expect(r.novaParcela.valor).toBe(13000);
      atual = parcela({ id: `n${i}`, vencimento: venc, valor: r.novaParcela.valor, valorPrincipal: r.novaParcela.valorPrincipal });
    }
    expect(atual.vencimento).toBe('2027-02-20');
  });

  it('pagou 50: 30 de juros, 20 amortizam; próximo mês 80 + 24 = 104', () => {
    const r = renovarPagandoJuros({ parcela: p, valorPago: 5000, novoVencimento: '2026-12-20', numeroNova: 2 });
    expect(r.pagamento).toEqual({ valor: 5000, principal: 2000, juros: 3000 });
    expect(r.novaParcela).toMatchObject({ valor: 10400, valorPrincipal: 8000, valorJuros: 2400 });
  });

  it('parcela já parcialmente paga (10 de juros antes): renovar com os 20 de juros restantes', () => {
    const parcial = parcela({ vencimento: '2026-11-20', valor: 13000, valorPrincipal: 10000, valorPago: 1000, principalPago: 0, jurosPago: 1000 });
    const r = renovarPagandoJuros({ parcela: parcial, valorPago: 2000, novoVencimento: '2026-12-20', numeroNova: 2 });
    expect(r.parcelaFechada).toEqual({ valor: 3000, valorPrincipal: 0, valorJuros: 3000 });
    expect(r.novaParcela.valor).toBe(13000);
  });

  it('regras: abaixo dos juros, quitação, vencimento, parcela fechada', () => {
    expect(() => renovarPagandoJuros({ parcela: p, valorPago: 2999, novoVencimento: '2026-12-20', numeroNova: 2 })).toThrow(/ao menos os juros/);
    expect(() => renovarPagandoJuros({ parcela: p, valorPago: 13000, novoVencimento: '2026-12-20', numeroNova: 2 })).toThrow(/quita a parcela/);
    expect(() => renovarPagandoJuros({ parcela: p, valorPago: 3000, novoVencimento: '2026-11-20', numeroNova: 2 })).toThrow(/depois do atual/);
    expect(() => renovarPagandoJuros({ parcela: parcela({ status: 'cancelada' }), valorPago: 1, novoVencimento: '2027-01-01', numeroNova: 2 })).toThrow(/cancelada/);
    const paga = parcela({ valor: 100, valorPrincipal: 80, valorPago: 100, principalPago: 80, jurosPago: 20 });
    expect(() => renovarPagandoJuros({ parcela: paga, valorPago: 1, novoVencimento: '2027-01-01', numeroNova: 2 })).toThrow(/já está paga/);
    const semPrincipal = parcela({ valor: 100, valorPrincipal: 0, valorJuros: 100 });
    expect(() => renovarPagandoJuros({ parcela: semPrincipal, valorPago: 100, novoVencimento: '2027-01-01', numeroNova: 2 })).toThrow(/sem principal/);
    expect(() => renovarPagandoJuros({ parcela: p, valorPago: 1.5, novoVencimento: '2027-01-01', numeroNova: 2 })).toThrow(/centavos/);
  });

  it('próximo vencimento: dia fixo → mesmo dia do mês seguinte; prazo em dias → mesmo prazo', () => {
    expect(vencimentoRenovacao('2026-11-20', '2026-10-20', '2026-11-20')).toBe('2026-12-20');
    expect(vencimentoRenovacao('2027-01-31', '2026-12-31', '2027-01-31')).toBe('2027-02-28');
    expect(vencimentoRenovacao('2026-11-05', '2026-10-20', '2026-11-05')).toBe('2026-11-21'); // prazo de 16 dias
    expect(vencimentoRenovacao('2026-10-21', '2026-10-21', '2026-10-21')).toBe('2026-11-21');
  });
});
