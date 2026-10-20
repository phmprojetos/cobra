import { describe, expect, it } from 'vitest';
import {
  assertHora,
  compararDatas,
  compararHoras,
  dataLocal,
  dataValida,
  dentroDoPeriodo,
  diaSemana,
  diferencaDias,
  horaLocal,
  inicioSemana,
  instanteLocal,
  somarDias,
  somarMeses,
} from '../src';

describe('aritmética de datas', () => {
  it('soma dias atravessando mês e ano', () => {
    expect(somarDias('2026-12-30', 5)).toBe('2027-01-04');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('soma meses com fim de mês', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29');
    expect(somarMeses('2026-11-15', 2)).toBe('2027-01-15');
  });
  it('diferença de dias', () => {
    expect(diferencaDias('2026-10-20', '2026-12-15')).toBe(56);
    expect(diferencaDias('2026-10-20', '2026-10-19')).toBe(-1);
  });
  it('dia da semana ISO e início de semana', () => {
    expect(diaSemana('2026-10-19')).toBe(1); // segunda
    expect(diaSemana('2026-10-25')).toBe(7); // domingo
    expect(inicioSemana('2026-10-25')).toBe('2026-10-19');
    expect(inicioSemana('2026-10-19')).toBe('2026-10-19');
  });
  it('validação', () => {
    expect(dataValida('2026-02-30')).toBe(false);
    expect(dataValida('2026-2-3')).toBe(false);
    expect(dataValida('2026-02-28')).toBe(true);
    expect(() => somarDias('xx', 1)).toThrow(/Data inválida/);
    expect(() => assertHora('24:00')).toThrow(/Horário inválido/);
  });
  it('comparações', () => {
    expect(compararDatas('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compararDatas('2026-01-02', '2026-01-01')).toBe(1);
    expect(compararDatas('2026-01-01', '2026-01-01')).toBe(0);
    expect(compararHoras('08:00', '22:00')).toBe(-1);
    expect(compararHoras('22:00', '08:00')).toBe(1);
    expect(compararHoras('08:00', '08:00')).toBe(0);
    expect(dentroDoPeriodo('2026-01-05', '2026-01-01', '2026-01-05')).toBe(true);
    expect(dentroDoPeriodo('2026-01-06', '2026-01-01', '2026-01-05')).toBe(false);
  });
});

describe('timezone', () => {
  // 2026-10-21 02:30 UTC = 20/10 23:30 em São Paulo (UTC-3)
  const instante = new Date('2026-10-21T02:30:00Z');

  it('mesmo instante é dia diferente em fusos diferentes', () => {
    expect(dataLocal(instante, 'America/Sao_Paulo')).toBe('2026-10-20');
    expect(dataLocal(instante, 'UTC')).toBe('2026-10-21');
    expect(dataLocal(instante, 'Asia/Tokyo')).toBe('2026-10-21');
    expect(horaLocal(instante, 'America/Sao_Paulo')).toBe('23:30');
  });

  it('instanteLocal inverte dataLocal/horaLocal', () => {
    const d = instanteLocal('2026-10-20', '08:00', 'America/Sao_Paulo');
    expect(d.toISOString()).toBe('2026-10-20T11:00:00.000Z');
    expect(instanteLocal('2026-10-20', '08:00', 'UTC').toISOString()).toBe('2026-10-20T08:00:00.000Z');
  });

  it('lida com horário de verão (Nova York)', () => {
    // Antes e depois da mudança de 01/11/2026
    expect(instanteLocal('2026-10-31', '08:00', 'America/New_York').toISOString()).toBe(
      '2026-10-31T12:00:00.000Z',
    );
    expect(instanteLocal('2026-11-02', '08:00', 'America/New_York').toISOString()).toBe(
      '2026-11-02T13:00:00.000Z',
    );
    // 08/03/2026 02:30 não existe em NY: deve cair num instante válido próximo
    const gap = instanteLocal('2026-03-08', '02:30', 'America/New_York');
    expect(dataLocal(gap, 'America/New_York')).toBe('2026-03-08');
  });

  it('rejeita timezone inválido', () => {
    expect(() => dataLocal(instante, 'Marte/Olympus')).toThrow(/Timezone inválido/);
  });
});
