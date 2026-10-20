import { describe, expect, it } from 'vitest';
import { CONFIG_PADRAO, montarConfiguracao } from '../src/mapeadores';

describe('montarConfiguracao', () => {
  it('tabela > env > padrão', () => {
    expect(montarConfiguracao([{ chave: 'moeda', valor: 'USD' }], { MOEDA: 'EUR' }).moeda).toBe('USD');
    expect(montarConfiguracao([], { MOEDA: 'EUR' }).moeda).toBe('EUR');
    expect(montarConfiguracao([])).toEqual(CONFIG_PADRAO);
  });
  it('canal de alertas', () => {
    expect(montarConfiguracao([{ chave: 'canal_alertas', valor: { id: -1001234, titulo: 'Alertas' } }]).canalAlertas).toEqual({ id: -1001234, titulo: 'Alertas' });
    expect(montarConfiguracao([{ chave: 'canal_alertas', valor: { id: -1, titulo: 3 } }]).canalAlertas).toEqual({ id: -1, titulo: '' });
    expect(montarConfiguracao([{ chave: 'canal_alertas', valor: false }]).canalAlertas).toBeNull();
    expect(montarConfiguracao([{ chave: 'canal_alertas', valor: { id: 'x' } }]).canalAlertas).toBeNull();
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
