import { describe, expect, it } from 'vitest';
import {
  aReceberNoPeriodo,
  calcularKpis,
  fluxoProjetado,
  listarAtrasados,
  metricasCliente,
  resumoDiario,
  type Carteira,
} from '../src';
import { operacao, pagamento, parcela } from './helpers';

const hoje = '2026-10-20'; // terça

// Carlos: 2000 → 2400 em 15/12, pagou 1200 em 10/10 (proporcional: 1000 principal, 200 juros)
const opCarlos = operacao({ id: 'carlos-op', clienteId: 'carlos', valorPrincipal: 200000, valorTotalReceber: 240000 });
const parCarlos = parcela({
  id: 'carlos-1',
  operacaoId: 'carlos-op',
  vencimento: '2026-12-15',
  valor: 240000,
  valorPrincipal: 200000,
  valorPago: 120000,
  principalPago: 100000,
  jurosPago: 20000,
  status: 'parcial',
});
const pagCarlos = pagamento({
  parcelaId: 'carlos-1',
  data: '2026-10-10',
  valor: 120000,
  valorPrincipalAlocado: 100000,
  valorJurosAlocado: 20000,
});

// Ana: 500 → 600 em 4x semanais; 1ª (16/10) atrasada, 2ª vence hoje, 3ª e 4ª futuras
const opAna = operacao({ id: 'ana-op', clienteId: 'ana', valorPrincipal: 50000, valorTotalReceber: 60000, tipo: 'parcelada', status: 'atrasada', renegociacoes: 1 });
const parAna = ['2026-10-16', '2026-10-20', '2026-10-27', '2026-11-03'].map((v, i) =>
  parcela({ id: `ana-${i + 1}`, operacaoId: 'ana-op', numero: i + 1, vencimento: v, valor: 15000, valorPrincipal: 12500 }),
);

// Bia: quitada (paga com 2 dias de atraso), e uma perdida
const opBia = operacao({ id: 'bia-op', clienteId: 'bia', status: 'quitada', valorPrincipal: 800 });
const parBia = parcela({ id: 'bia-1', operacaoId: 'bia-op', vencimento: '2026-10-05', valor: 1000, valorPrincipal: 800, valorPago: 1000, principalPago: 800, jurosPago: 200, status: 'paga' });
const pagBia = pagamento({ parcelaId: 'bia-1', data: '2026-10-07', valor: 1000, valorPrincipalAlocado: 800, valorJurosAlocado: 200 });
const opPerdida = operacao({ id: 'perdida-op', clienteId: 'bia', status: 'perdida', perdidaEm: '2026-10-12', valorPrejuizo: 5000 });
const parPerdida = parcela({ id: 'perd-1', operacaoId: 'perdida-op', vencimento: '2026-09-01', valor: 6000, valorPrincipal: 5000 });
const opCancelada = operacao({ id: 'canc-op', clienteId: 'bia', status: 'cancelada', valorPrincipal: 99999 });

const carteira: Carteira = {
  operacoes: [opCarlos, opAna, opBia, opPerdida, opCancelada],
  parcelas: [parCarlos, ...parAna, parBia, parPerdida],
  pagamentos: [pagCarlos, pagBia],
};
const outubro = { inicio: '2026-10-01', fim: '2026-10-31' };

describe('calcularKpis', () => {
  it('compõe os 4 KPIs + lucro + prejuízo', () => {
    expect(calcularKpis(carteira, hoje, outubro)).toEqual({
      capitalNaRua: 100000 + 50000,
      totalAReceber: 120000 + 60000,
      aReceber7Dias: 15000, // ana-2 (hoje); ana-3 (27/10) fica fora de hoje..hoje+6
      totalVencido: 15000, // ana-1
      lucroRealizado: 20000 + 200,
      lucroARealizar: 2500 * 3, // ana-1..3 vencem em outubro
      prejuizo: 5000,
    });
  });
  it('prejuízo fora do período não conta', () => {
    expect(calcularKpis(carteira, hoje, { inicio: '2026-11-01', fim: '2026-11-30' }).prejuizo).toBe(0);
  });
});

describe('listarAtrasados', () => {
  it('ordena por saldo × dias de atraso', () => {
    const extra = parcela({ id: 'carlos-old', operacaoId: 'carlos-op', vencimento: '2026-10-18', valor: 10000 });
    const c = { ...carteira, parcelas: [...carteira.parcelas, extra] };
    const r = listarAtrasados(c, hoje);
    expect(r.map((x) => [x.parcelaId, x.diasAtraso, x.prioridade])).toEqual([
      ['ana-1', 4, 60000],
      ['carlos-old', 2, 20000],
    ]);
    expect(r[0]!.clienteId).toBe('ana');
  });
});

describe('fluxoProjetado', () => {
  it('8 semanas de segunda a domingo; vencido na semana atual', () => {
    const f = fluxoProjetado(carteira, hoje);
    expect(f).toHaveLength(8);
    expect(f[0]).toEqual({ inicio: '2026-10-19', fim: '2026-10-25', emDia: 15000, vencido: 15000 });
    expect(f[1]).toMatchObject({ inicio: '2026-10-26', emDia: 15000, vencido: 0 });
    expect(f[2]).toMatchObject({ emDia: 15000 });
    expect(f[7]).toMatchObject({ inicio: '2026-12-07', emDia: 0 });
    // 15/12 cai na 9ª semana
    expect(fluxoProjetado(carteira, hoje, 9)[8]).toMatchObject({ inicio: '2026-12-14', emDia: 120000 });
  });
});

describe('metricasCliente', () => {
  it('Bia: pagou com atraso, tem perda', () => {
    expect(metricasCliente(carteira, 'bia', hoje)).toEqual({
      totalEmprestado: 800 + 800,
      totalRecebido: 1000,
      saldoAtual: 0,
      operacoes: 2,
      operacoesEmAberto: 0,
      percentualPagoEmDia: 0,
      atrasoMedioDias: (2 + 49) / 2, // bia-1 pago 2 dias depois; perd-1 vencida há 49 dias
      renegociacoes: 0,
    });
  });
  it('Ana: uma vencida e renegociação', () => {
    expect(metricasCliente(carteira, 'ana', hoje)).toMatchObject({
      saldoAtual: 60000,
      percentualPagoEmDia: 0,
      atrasoMedioDias: 4,
      renegociacoes: 1,
    });
  });
  it('Carlos: sem base para pontualidade', () => {
    expect(metricasCliente(carteira, 'carlos', hoje)).toMatchObject({
      percentualPagoEmDia: null,
      atrasoMedioDias: null,
      saldoAtual: 120000,
    });
  });
  it('pagamento em dia', () => {
    const p = parcela({ id: 'z', operacaoId: 'z-op', vencimento: '2026-10-10', valor: 100, valorPrincipal: 80, valorPago: 100, principalPago: 80, jurosPago: 20 });
    const c: Carteira = {
      operacoes: [operacao({ id: 'z-op', clienteId: 'z', status: 'quitada' })],
      parcelas: [p],
      pagamentos: [pagamento({ parcelaId: 'z', data: '2026-10-10', valor: 100 })],
    };
    expect(metricasCliente(c, 'z', hoje)).toMatchObject({ percentualPagoEmDia: 1, atrasoMedioDias: 0 });
  });
  it('parcela quitada sem pagamento registrado não entra na base', () => {
    const p = parcela({ id: 'w', operacaoId: 'w-op', valor: 100, valorPrincipal: 80, valorPago: 100, principalPago: 80, jurosPago: 20 });
    const c: Carteira = { operacoes: [operacao({ id: 'w-op', clienteId: 'w' })], parcelas: [p], pagamentos: [] };
    expect(metricasCliente(c, 'w', hoje).percentualPagoEmDia).toBeNull();
  });
});

describe('resumoDiario e consultas', () => {
  it('resumo diário', () => {
    const r = resumoDiario(carteira, hoje);
    expect(r).toMatchObject({ data: hoje, aReceberHoje: 15000, pessoasHoje: 1, totalVencido: 15000 });
    expect(r.topAtrasados).toHaveLength(1);
  });
  it('a receber no período, ordenado', () => {
    const r = aReceberNoPeriodo(carteira, { inicio: '2026-10-19', fim: '2026-12-31' });
    expect(r.map((p) => p.id)).toEqual(['ana-2', 'ana-3', 'ana-4', 'carlos-1']);
    const mesmoDia = aReceberNoPeriodo(
      { ...carteira, parcelas: [parAna[1]!, { ...parAna[1]!, id: 'dup' }] },
      { inicio: hoje, fim: hoje },
    );
    expect(mesmoDia).toHaveLength(2);
  });
});
