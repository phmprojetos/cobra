import { describe, expect, it } from 'vitest';
import {
  assertCentavos,
  dividirIgual,
  ErroRegra,
  formatarMoeda,
  formatarPercentual,
  parseValor,
  soma,
} from '../src';

describe('dividirIgual', () => {
  it('divide exato', () => expect(dividirIgual(60000, 4)).toEqual([15000, 15000, 15000, 15000]));
  it('ajuste de centavos fica na última', () => {
    expect(dividirIgual(100, 3)).toEqual([33, 33, 34]);
    expect(dividirIgual(1001, 4)).toEqual([250, 250, 250, 251]);
  });
  it('soma sempre fecha', () => {
    for (const [t, n] of [[99999, 7], [1, 3], [123457, 12]] as const) {
      expect(soma(dividirIgual(t, n))).toBe(t);
    }
  });
  it('rejeita n inválido', () => {
    expect(() => dividirIgual(100, 0)).toThrow(ErroRegra);
    expect(() => dividirIgual(100, 1.5)).toThrow(ErroRegra);
  });
  it('rejeita valor fracionário', () => expect(() => dividirIgual(10.5, 2)).toThrow(/centavos/));
});

describe('assertCentavos', () => {
  it('aceita inteiros', () => expect(() => assertCentavos(10)).not.toThrow());
  it('rejeita NaN', () => expect(() => assertCentavos(Number.NaN, 'x')).toThrow(/x deve/));
});

describe('parseValor', () => {
  it.each([
    ['2000', 200000],
    ['2.400', 240000],
    ['2.400,50', 240050],
    ['2400,5', 240050],
    ['2400.50', 240050],
    ['R$ 1.200,00', 120000],
    ['1,200.75', 120075],
    ['1.000.000', 100000000],
    ['0,99', 99],
    ['-50', -5000],
  ])('%s → %i', (txt, cents) => expect(parseValor(txt)).toBe(cents));

  it.each(['', 'abc', '-', '1-2', '12.3456', 'R$'])('rejeita %s', (txt) =>
    expect(parseValor(txt)).toBeNull(),
  );
  it('rejeita valores enormes', () => expect(parseValor('9'.repeat(20))).toBeNull());
});

describe('formatação', () => {
  it('formata BRL', () =>
    expect(formatarMoeda(240050, { moeda: 'BRL', locale: 'pt-BR' }).replace(/\s/g, ' ')).toBe(
      'R$ 2.400,50',
    ));
  it('formata USD', () => expect(formatarMoeda(123, { moeda: 'USD', locale: 'en-US' })).toBe('$1.23'));
  it('formata percentual', () =>
    expect(formatarPercentual(0.1234, 'pt-BR').replace(/\s/g, ' ')).toBe('12,34%'));
});
