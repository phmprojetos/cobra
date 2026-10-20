import { describe, expect, it } from 'vitest';
import {
  calcularIndicadores,
  gerarParcelas,
  repartirPrincipalJuros,
  soma,
  taxaMensalEquivalente,
  taxaPeriodo,
  tirMensal,
  vencimentoDaParcela,
} from '../src';

describe('taxas', () => {
  it('taxa do período', () => expect(taxaPeriodo(200000, 240000)).toBeCloseTo(0.2, 10));

  it('taxa mensal equivalente em 30 dias é a própria taxa do período', () => {
    expect(taxaMensalEquivalente(100000, 110000, 30)).toBeCloseTo(0.1, 10);
  });

  it('normaliza prazos maiores e menores que 30 dias (juros compostos)', () => {
    // 21% em 60 dias = 10% a.m.
    expect(taxaMensalEquivalente(100000, 121000, 60)).toBeCloseTo(0.1, 10);
    // 10% em 15 dias = 21% a.m.
    expect(taxaMensalEquivalente(100000, 110000, 15)).toBeCloseTo(0.21, 10);
  });

  it('rejeita prazo/principal inválidos', () => {
    expect(() => taxaMensalEquivalente(1000, 1100, 0)).toThrow(/Prazo/);
    expect(() => taxaPeriodo(0, 100)).toThrow(/Principal/);
  });

  it('TIR coincide com a fórmula para fluxo único', () => {
    const tir = tirMensal([
      { dias: 0, valor: -200000 },
      { dias: 56, valor: 240000 },
    ]);
    expect(tir).toBeCloseTo(taxaMensalEquivalente(200000, 240000, 56), 8);
  });

  it('TIR com taxas muito altas', () => {
    // dobrar em 7 dias
    const tir = tirMensal([
      { dias: 0, valor: -100 },
      { dias: 7, valor: 200 },
    ]);
    expect(tir).toBeCloseTo(Math.pow(2, 30 / 7) - 1, 6);
  });

  it('TIR zero quando total = principal', () => {
    expect(
      tirMensal([
        { dias: 0, valor: -100 },
        { dias: 30, valor: 100 },
      ]),
    ).toBeCloseTo(0, 9);
  });

  it('TIR rejeita fluxos sem troca de sinal ou absurdos', () => {
    expect(() => tirMensal([{ dias: 0, valor: 100 }])).toThrow(/TIR/);
    expect(() =>
      tirMensal([
        { dias: 0, valor: -1 },
        { dias: 1, valor: 1e12 },
      ]),
    ).toThrow(/Não foi possível/);
  });
});

describe('calcularIndicadores', () => {
  it('parcela única: "emprestei 2000, volta 2400 dia 15/12" (hoje 20/10)', () => {
    const r = calcularIndicadores({
      dataEmprestimo: '2026-10-20',
      principal: 200000,
      parcelas: [{ vencimento: '2026-12-15', valor: 240000 }],
    });
    expect(r.jurosTotal).toBe(40000);
    expect(r.prazoDias).toBe(56);
    expect(r.taxaPeriodo).toBeCloseTo(0.2, 10);
    expect(r.taxaEfetivaMensal).toBeCloseTo(Math.pow(1.2, 30 / 56) - 1, 10);
  });

  it('parcelada usa TIR', () => {
    const parcelas = gerarParcelas({
      dataEmprestimo: '2026-10-20',
      principal: 50000,
      totalReceber: 60000,
      numeroParcelas: 4,
      primeiroVencimento: '2026-10-23',
      periodicidade: 'semanal',
    });
    const r = calcularIndicadores({ dataEmprestimo: '2026-10-20', principal: 50000, parcelas });
    expect(r.prazoDias).toBe(24);
    // TIR > taxa simples equivalente, pois o dinheiro volta antes do fim
    expect(r.taxaEfetivaMensal).toBeGreaterThan(taxaMensalEquivalente(50000, 60000, 24));
  });

  it('rejeita sem parcelas ou vencimento no mesmo dia', () => {
    expect(() =>
      calcularIndicadores({ dataEmprestimo: '2026-10-20', principal: 1, parcelas: [] }),
    ).toThrow(/sem parcelas/);
    expect(() =>
      calcularIndicadores({
        dataEmprestimo: '2026-10-20',
        principal: 100,
        parcelas: [{ vencimento: '2026-10-20', valor: 110 }],
      }),
    ).toThrow(/vencimento/);
  });
});

describe('gerarParcelas', () => {
  const base = {
    dataEmprestimo: '2026-10-20',
    principal: 50000,
    totalReceber: 60000,
    numeroParcelas: 4,
    primeiroVencimento: '2026-10-23',
    periodicidade: 'semanal' as const,
  };

  it('"Ana pegou 500, paga 600 em 4x semanais começando sexta"', () => {
    const ps = gerarParcelas(base);
    expect(ps.map((p) => p.vencimento)).toEqual([
      '2026-10-23',
      '2026-10-30',
      '2026-11-06',
      '2026-11-13',
    ]);
    expect(ps.map((p) => p.valor)).toEqual([15000, 15000, 15000, 15000]);
    expect(ps.every((p) => p.valorPrincipal === 12500 && p.valorJuros === 2500)).toBe(true);
  });

  it('centavos: soma de valores, principal e juros fecha exatamente', () => {
    const ps = gerarParcelas({ ...base, principal: 33333, totalReceber: 40001, numeroParcelas: 3 });
    expect(ps.map((p) => p.valor)).toEqual([13333, 13333, 13335]);
    expect(soma(ps.map((p) => p.valor))).toBe(40001);
    expect(soma(ps.map((p) => p.valorPrincipal))).toBe(33333);
    expect(soma(ps.map((p) => p.valorJuros))).toBe(40001 - 33333);
    expect(ps.every((p) => p.valorPrincipal >= 0 && p.valorJuros >= 0)).toBe(true);
  });

  it('quinzenal e mensal', () => {
    expect(vencimentoDaParcela('2026-01-31', 2, 'quinzenal')).toBe('2026-03-02');
    const ps = gerarParcelas({ ...base, primeiroVencimento: '2027-01-31', periodicidade: 'mensal' });
    expect(ps.map((p) => p.vencimento)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });

  it('parcela única', () => {
    const [p, ...resto] = gerarParcelas({ ...base, numeroParcelas: 1, totalReceber: 60000 });
    expect(resto).toHaveLength(0);
    expect(p).toMatchObject({ numero: 1, valor: 60000, valorPrincipal: 50000, valorJuros: 10000 });
  });

  it('sem juros', () => {
    const ps = repartirPrincipalJuros([500, 500], 1000);
    expect(ps).toEqual([
      { valorPrincipal: 500, valorJuros: 0 },
      { valorPrincipal: 500, valorJuros: 0 },
    ]);
  });

  it('validações', () => {
    expect(() => gerarParcelas({ ...base, principal: 0 })).toThrow(/positivo/);
    expect(() => gerarParcelas({ ...base, totalReceber: 100 })).toThrow(/menor/);
    expect(() => gerarParcelas({ ...base, primeiroVencimento: '2026-10-20' })).toThrow(/depois/);
    expect(() => gerarParcelas({ ...base, principal: 1.5 })).toThrow(/centavos/);
  });
});
