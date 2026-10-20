import { describe, expect, it } from 'vitest';
import { cnpjValido, completarCpf, cpfValido, formatarDocumento, parseDocumento } from '../src';

// Números válidos de exemplo (gerados para teste; não pertencem a ninguém).
const CPF = '52998224725';
const CNPJ = '11222333000181';

describe('validação', () => {
  it('CPF', () => {
    expect(cpfValido(CPF)).toBe(true);
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224724')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
    expect(cpfValido('123')).toBe(false);
  });
  it('CNPJ', () => {
    expect(cnpjValido(CNPJ)).toBe(true);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11222333000182')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
    expect(cnpjValido('1')).toBe(false);
  });
});

describe('parseDocumento', () => {
  it.each([
    ['529.982.247-25', { tipo: 'cpf', numero: CPF }],
    ['cpf 52998224725', { tipo: 'cpf', numero: CPF }],
    ['CPF: 529 982 247 25', { tipo: 'cpf', numero: CPF }],
    ['11.222.333/0001-81', { tipo: 'cnpj', numero: CNPJ }],
    ['cnpj 11222333000181', { tipo: 'cnpj', numero: CNPJ }],
    ['RG 12.345.678-9', { tipo: 'rg', numero: '123456789' }],
    ['rg mg-12.345.678', { tipo: 'rg', numero: 'MG12345678' }],
    ['outro AB123456', { tipo: 'outro', numero: 'AB123456' }],
    ['passaporte FX123456', { tipo: 'outro', numero: 'FX123456' }],
    ['CNH 01234567890', { tipo: 'outro', numero: '01234567890' }],
  ])('%s', (txt, esperado) => expect(parseDocumento(txt)).toEqual(esperado));

  it.each([
    ['52998224724', /CPF inválido/],
    ['11222333000182', /CNPJ inválido/],
    ['123456', /Não reconheci/],
    ['abc', /Não reconheci/],
    ['RG 12', /curto/],
    ['cpf 11222333000181', /Não reconheci/],
    ['cnpj 52998224725', /Não reconheci/],
  ])('rejeita %s', (txt, msg) => {
    const r = parseDocumento(txt);
    expect('erro' in r && r.erro).toMatch(msg);
  });
});

describe('completarCpf', () => {
  it('gera CPF válido', () => {
    expect(completarCpf('529982247')).toBe(CPF);
    for (const b of ['000000001', '123456789', '987654321']) expect(cpfValido(completarCpf(b))).toBe(true);
  });
});

describe('formatarDocumento', () => {
  it('formata por tipo', () => {
    expect(formatarDocumento('cpf', CPF)).toBe('529.982.247-25');
    expect(formatarDocumento('cnpj', CNPJ)).toBe('11.222.333/0001-81');
    expect(formatarDocumento('rg', '123456789')).toBe('RG 123456789');
    expect(formatarDocumento('outro', 'AB1')).toBe('AB1');
    expect(formatarDocumento(null, null)).toBe('—');
  });
});
