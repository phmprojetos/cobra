import { describe, expect, it } from 'vitest';
import {
  avaliarNotificacoes,
  chaveAlerta,
  emSilencio,
  instanteDisparo,
  type EntradaAvaliacao,
  type RegraNotificacao,
} from '../src';

const TZ = 'America/Sao_Paulo';
const em = (local: string) => new Date(`${local}:00-03:00`); // horário de SP

function regra(over: Partial<RegraNotificacao>): RegraNotificacao {
  return {
    id: over.tipo ?? 'r',
    tipo: 'no_dia',
    offsetDias: 0,
    horario: '09:00',
    diaSemana: null,
    ativo: true,
    silenciarClientes: [],
    ...over,
  };
}

const parcelas = [
  { id: 'p-hoje', clienteId: 'carlos', vencimento: '2026-10-20', saldo: 1000 },
  { id: 'p-amanha', clienteId: 'ana', vencimento: '2026-10-21', saldo: 1000 },
  { id: 'p-atraso1', clienteId: 'ana', vencimento: '2026-10-19', saldo: 1000 },
  { id: 'p-atraso3', clienteId: 'carlos', vencimento: '2026-10-17', saldo: 1000 },
  { id: 'p-quitada', clienteId: 'ana', vencimento: '2026-10-20', saldo: 0 },
];

function entrada(over: Partial<EntradaAvaliacao>): EntradaAvaliacao {
  return {
    agora: em('2026-10-20T09:05'),
    timezone: TZ,
    silencio: { inicio: '22:00', fim: '08:00' },
    regras: [],
    parcelas,
    enviadas: new Set(),
    ...over,
  };
}

const ids = (e: EntradaAvaliacao) => avaliarNotificacoes(e).map((a) => `${a.regra.id}:${a.parcelaId}:${a.dataReferencia}`);

describe('emSilencio', () => {
  const s = { inicio: '22:00', fim: '08:00' };
  it('janela que cruza a meia-noite', () => {
    expect(emSilencio('23:00', s)).toBe(true);
    expect(emSilencio('03:00', s)).toBe(true);
    expect(emSilencio('08:00', s)).toBe(false);
    expect(emSilencio('12:00', s)).toBe(false);
  });
  it('janela no mesmo dia', () => {
    const t = { inicio: '12:00', fim: '14:00' };
    expect(emSilencio('13:00', t)).toBe(true);
    expect(emSilencio('14:00', t)).toBe(false);
    expect(emSilencio('11:59', t)).toBe(false);
  });
  it('sem silêncio', () => {
    expect(emSilencio('03:00', null)).toBe(false);
    expect(emSilencio('03:00', { inicio: '00:00', fim: '00:00' })).toBe(false);
  });
});

describe('instanteDisparo', () => {
  const s = { inicio: '22:00', fim: '08:00' };
  it('fora do silêncio é o próprio horário', () => {
    expect(instanteDisparo('2026-10-20', '09:00', s, TZ)).toEqual(em('2026-10-20T09:00'));
  });
  it('de madrugada adia para o fim do silêncio no mesmo dia', () => {
    expect(instanteDisparo('2026-10-20', '06:00', s, TZ)).toEqual(em('2026-10-20T08:00'));
  });
  it('à noite adia para o dia seguinte', () => {
    expect(instanteDisparo('2026-10-20', '23:00', s, TZ)).toEqual(em('2026-10-21T08:00'));
  });
  it('silêncio diurno', () => {
    expect(instanteDisparo('2026-10-20', '13:00', { inicio: '12:00', fim: '14:00' }, TZ)).toEqual(
      em('2026-10-20T14:00'),
    );
  });
});

describe('avaliarNotificacoes', () => {
  const regrasPadrao = [
    regra({ id: 'd-1', tipo: 'lembrete_antes', offsetDias: 1 }),
    regra({ id: 'd0', tipo: 'no_dia' }),
    regra({ id: 'd+1', tipo: 'atraso', offsetDias: 1 }),
    regra({ id: 'd+3', tipo: 'atraso', offsetDias: 3 }),
  ];

  it('dispara lembrete, no dia e atrasos; ignora quitadas', () => {
    expect(ids(entrada({ regras: regrasPadrao })).sort()).toEqual(
      [
        'd-1:p-amanha:2026-10-20',
        'd0:p-hoje:2026-10-20',
        'd+1:p-atraso1:2026-10-20',
        'd+3:p-atraso3:2026-10-20',
      ].sort(),
    );
  });

  it('antes do horário não dispara', () => {
    expect(ids(entrada({ regras: regrasPadrao, agora: em('2026-10-20T08:59') }))).toEqual([]);
  });

  it('idempotência: não repete o que já foi enviado', () => {
    const enviadas = new Set([chaveAlerta('d0', 'p-hoje', '2026-10-20')]);
    expect(ids(entrada({ regras: [regrasPadrao[1]!], enviadas }))).toEqual([]);
  });

  it('respeita regra inativa e clientes silenciados', () => {
    expect(ids(entrada({ regras: [regra({ ativo: false })] }))).toEqual([]);
    expect(ids(entrada({ regras: [regra({ id: 'd0', silenciarClientes: ['carlos'] })] }))).toEqual([]);
  });

  it('não dispara depois da janela máxima (job fora do ar)', () => {
    expect(ids(entrada({ regras: [regra({ id: 'd0' })], agora: em('2026-10-20T15:01') }))).toEqual([]);
    expect(ids(entrada({ regras: [regra({ id: 'd0' })], agora: em('2026-10-20T15:00') }))).toEqual([
      'd0:p-hoje:2026-10-20',
    ]);
  });

  it('alerta das 23h adiado pelo silêncio sai às 08h do dia seguinte, com referência do dia original', () => {
    const r = [regra({ id: 'd0', horario: '23:00' })];
    expect(ids(entrada({ regras: r, agora: em('2026-10-20T23:30') }))).toEqual([]);
    expect(ids(entrada({ regras: r, agora: em('2026-10-21T08:00') }))).toEqual(['d0:p-hoje:2026-10-20']);
  });

  it('resumo diário uma vez por dia', () => {
    const r = [regra({ id: 'diario', tipo: 'resumo_diario', horario: '08:00' })];
    const a = avaliarNotificacoes(entrada({ regras: r, agora: em('2026-10-20T08:00') }));
    expect(a).toEqual([expect.objectContaining({ tipo: 'resumo_diario', parcelaId: null, dataReferencia: '2026-10-20' })]);
    const enviadas = new Set([chaveAlerta('diario', null, '2026-10-20')]);
    expect(avaliarNotificacoes(entrada({ regras: r, agora: em('2026-10-20T08:15'), enviadas }))).toEqual([]);
  });

  it('lista diária de atrasados sai uma vez por dia, sem parcela', () => {
    const r = [regra({ id: 'lista', tipo: 'lista_atrasados', horario: '09:00' })];
    expect(avaliarNotificacoes(entrada({ regras: r }))).toEqual([
      expect.objectContaining({ tipo: 'lista_atrasados', parcelaId: null, dataReferencia: '2026-10-20' }),
    ]);
    const enviadas = new Set([chaveAlerta('lista', null, '2026-10-20')]);
    expect(avaliarNotificacoes(entrada({ regras: r, enviadas }))).toEqual([]);
  });

  it('resumo semanal só no dia configurado (segunda por padrão)', () => {
    const r = [regra({ id: 'sem', tipo: 'resumo_semanal', horario: '08:00' })];
    // 2026-10-19 é segunda
    expect(ids(entrada({ regras: r, agora: em('2026-10-19T08:00') }))).toEqual(['sem:null:2026-10-19']);
    expect(ids(entrada({ regras: r, agora: em('2026-10-20T08:00') }))).toEqual([]);
    const sexta = [regra({ id: 'sem', tipo: 'resumo_semanal', horario: '08:00', diaSemana: 5 })];
    expect(ids(entrada({ regras: sexta, agora: em('2026-10-23T08:00') }))).toEqual(['sem:null:2026-10-23']);
  });

  it('timezone: 00:30 UTC ainda é o dia anterior em São Paulo', () => {
    const r = [regra({ id: 'd0', horario: '21:00' })];
    const agora = new Date('2026-10-21T00:30:00Z'); // 20/10 21:30 em SP
    expect(ids(entrada({ regras: r, agora, silencio: null }))).toEqual(['d0:p-hoje:2026-10-20']);
  });
});
