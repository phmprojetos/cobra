import { describe, expect, it } from 'vitest';
import { CONFIG_PADRAO, montarConfiguracao } from '../src/mapeadores';

describe('montarConfiguracao', () => {
  it('tabela > env > padrão', () => {
    expect(montarConfiguracao([{ chave: 'moeda', valor: 'USD' }], { MOEDA: 'EUR' }).moeda).toBe('USD');
    expect(montarConfiguracao([], { MOEDA: 'EUR' }).moeda).toBe('EUR');
    expect(montarConfiguracao([])).toEqual(CONFIG_PADRAO);
  });
  it('valores inválidos caem no padrão', () => {
    const c = montarConfiguracao([
      { chave: 'moeda', valor: '"BRL"' },
      { chave: 'timezone', valor: 'Marte/Base' },
      { chave: 'estrategia_alocacao', valor: 'juros_primeiro' },
      { chave: 'horario_silencio', valor: false },
    ]);
    expect(c).toMatchObject({ moeda: 'BRL', timezone: 'America/Sao_Paulo', estrategiaAlocacao: 'juros_primeiro', silencio: null });
  });
});
