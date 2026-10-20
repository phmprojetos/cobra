import { describe, expect, it } from 'vitest';
import { mascararTelefone, normalizarNome, parseDataCurta, resolverCliente, telefoneValido } from '../src';

const hoje = '2026-10-20';

describe('parseDataCurta', () => {
  it.each([
    ['15/12', '2026-12-15'],
    ['dia 15/12', '2026-12-15'],
    ['20/10', '2026-10-20'], // hoje conta
    ['19/10', '2027-10-19'], // já passou → ano que vem
    ['15/12/2027', '2027-12-15'],
    ['1/2/27', '2027-02-01'],
    ['2026-12-30', '2026-12-30'],
    ['30', '2026-10-30'],
    ['dia 30', '2026-10-30'],
    ['10', '2026-11-10'], // dia 10 já passou neste mês
    ['31', '2026-10-31'],
  ])('%s → %s', (txt, esperado) => expect(parseDataCurta(txt, hoje)).toBe(esperado));

  it('direção passado (data de pagamento)', () => {
    expect(parseDataCurta('15/10', hoje, 'passado')).toBe('2026-10-15');
    expect(parseDataCurta('25/10', hoje, 'passado')).toBe('2025-10-25');
    expect(parseDataCurta('29/02', hoje, 'passado')).toBeNull();
  });
  it('dia 31 pula meses sem 31', () => {
    expect(parseDataCurta('31', '2026-11-05')).toBe('2026-12-31');
  });
  it('29/02 em ano não bissexto vai para o próximo bissexto? não: retorna null se nenhum dos 2 anos tem', () => {
    expect(parseDataCurta('29/02', '2026-10-20')).toBeNull();
    expect(parseDataCurta('29/02', '2027-10-20')).toBe('2028-02-29');
  });
  it.each(['32', '0', '31/02/2026', 'amanhã', '', '15-12'])('rejeita %s', (txt) =>
    expect(parseDataCurta(txt, hoje)).toBeNull(),
  );
});

describe('resolverCliente', () => {
  const clientes = [
    { id: '1', nome: 'Carlos Souza', apelidos: ['Carlão'] },
    { id: '2', nome: 'Ana Paula', apelidos: [] },
    { id: '3', nome: 'Ana Beatriz', apelidos: ['Bia'] },
    { id: '4', nome: 'João Pedro', apelidos: ['JP'] },
  ];

  it('normaliza', () => expect(normalizarNome('  JOÃO   Pédro ')).toBe('joao pedro'));
  it('primeiro nome único', () => expect(resolverCliente('Carlos', clientes)).toMatchObject({ tipo: 'unico', cliente: { id: '1' } }));
  it('apelido sem acento', () => expect(resolverCliente('carlao', clientes)).toMatchObject({ tipo: 'unico', cliente: { id: '1' } }));
  it('nome completo', () => expect(resolverCliente('ana paula', clientes)).toMatchObject({ tipo: 'unico', cliente: { id: '2' } }));
  it('prefixo', () => expect(resolverCliente('joa', clientes)).toMatchObject({ tipo: 'unico', cliente: { id: '4' } }));
  it('ambíguo', () => {
    const r = resolverCliente('Ana', clientes);
    expect(r.tipo).toBe('ambiguo');
    expect(r.tipo === 'ambiguo' && r.opcoes.map((c) => c.id)).toEqual(['2', '3']);
  });
  it('apelido exato repetido é ambíguo', () => {
    const r = resolverCliente('x', [
      { id: 'a', nome: 'A', apelidos: ['x'] },
      { id: 'b', nome: 'B', apelidos: ['X'] },
    ]);
    expect(r.tipo).toBe('ambiguo');
  });
  it('inexistente', () => {
    expect(resolverCliente('Zé', clientes).tipo).toBe('nenhum');
    expect(resolverCliente('  ', clientes).tipo).toBe('nenhum');
  });
});

describe('máscara de telefone', () => {
  it.each([
    ['', ''],
    ['1', '(1'],
    ['11', '(11'],
    ['119', '(11) 9'],
    ['1199999', '(11) 9999-9'],
    ['1133334444', '(11) 3333-4444'],
    ['11999990000', '(11) 99999-0000'],
    ['(11) 99999-0000', '(11) 99999-0000'],
    ['119999900001234', '(11) 99999-0000'], // corta o excesso
    ['5511999990000', '+55 (11) 99999-0000'],
    ['+55 11 3333-4444', '+55 (11) 3333-4444'],
    ['551', '(55) 1'], // DDD 55 (RS) não é confundido com DDI
    ['abc', ''],
  ])('%s → %s', (entrada, saida) => expect(mascararTelefone(entrada)).toBe(saida));

  it('é idempotente (reaplicar não muda)', () => {
    for (const t of ['(11) 99999-0000', '+55 (11) 3333-4444', '(11) 9999']) expect(mascararTelefone(mascararTelefone(t))).toBe(mascararTelefone(t));
  });

  it('validade', () => {
    expect(telefoneValido('(11) 99999-0000')).toBe(true);
    expect(telefoneValido('(11) 3333-4444')).toBe(true);
    expect(telefoneValido('+55 (11) 99999-0000')).toBe(true);
    expect(telefoneValido('(11) 9999')).toBe(false);
    expect(telefoneValido('')).toBe(false);
  });
});
