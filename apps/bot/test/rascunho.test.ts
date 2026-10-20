import { describe, expect, it } from 'vitest';
import { campoFaltante, completar, ehRascunho, mesclar, pergunta, preencherDireto, problema, resumoParcial, type Rascunho } from '../src/rascunho';
import { HOJE_FIXO, MENSAGENS, PARCIAIS } from './fixtures';

const op = (dados: Partial<Extract<Rascunho, { tipo: 'criar_operacao' }>['dados']>): Rascunho => ({
  tipo: 'criar_operacao',
  dados: {
    cliente: null,
    documento: null,
    valor_emprestado: null,
    valor_total_receber: null,
    numero_parcelas: null,
    periodicidade: null,
    primeiro_vencimento: null,
    data_emprestimo: null,
    observacoes: null,
    ...dados,
  },
});

describe('campo faltante (ordem das perguntas)', () => {
  it('empréstimo: cliente → emprestado → total → vencimento', () => {
    expect(campoFaltante(op({}))).toBe('cliente');
    expect(campoFaltante(op({ cliente: 'Pedro' }))).toBe('valor_emprestado');
    expect(campoFaltante(op({ cliente: 'Pedro', valor_emprestado: 800 }))).toBe('valor_total_receber');
    expect(campoFaltante(op({ cliente: 'Pedro', valor_emprestado: 800, valor_total_receber: 1000 }))).toBe('primeiro_vencimento');
    expect(campoFaltante(MENSAGENS[0]!.esperado as Rascunho)).toBeNull();
  });
  it('pagamento, prorrogação e cadastro', () => {
    expect(campoFaltante({ tipo: 'registrar_pagamento', dados: { cliente: null, valor: 10, data: null, forma: null } })).toBe('cliente');
    expect(campoFaltante({ tipo: 'registrar_pagamento', dados: { cliente: 'A', valor: null, data: null, forma: null } })).toBe('valor');
    expect(campoFaltante({ tipo: 'prorrogar', dados: { cliente: 'A', novo_vencimento: null, acrescimo: null } })).toBe('alteracao');
    expect(campoFaltante({ tipo: 'prorrogar', dados: { cliente: null, novo_vencimento: null, acrescimo: 1 } })).toBe('cliente');
    expect(campoFaltante({ tipo: 'prorrogar', dados: { cliente: 'A', novo_vencimento: null, acrescimo: 100 } })).toBeNull();
    expect(campoFaltante(PARCIAIS[1]!.esperado as Rascunho)).toBe('nome');
    expect(campoFaltante({ tipo: 'criar_cliente', dados: { nome: 'Pedro', apelidos: [], telefone: null, documento: null } })).toBeNull();
  });
  it('ehRascunho', () => {
    expect(ehRascunho(MENSAGENS[4]!.esperado)).toBe(false);
    expect(ehRascunho(PARCIAIS[0]!.esperado)).toBe(true);
  });
});

describe('o caso do print: "1000 para receber dia 20/11/2026"', () => {
  it('pede cliente, depois quanto emprestou; total < emprestado é perguntado de novo', () => {
    let r = PARCIAIS[0]!.esperado as Rascunho;
    expect(campoFaltante(r)).toBe('cliente');
    r = preencherDireto(r, 'cliente', 'Pedro Miquiles', HOJE_FIXO)!;
    expect(campoFaltante(r)).toBe('valor_emprestado');
    expect(pergunta('valor_emprestado', r)).toContain('Quanto você emprestou');
    r = preencherDireto(r, 'valor_emprestado', '1.200', HOJE_FIXO)!;
    // Quem acabou de ser respondido é o suspeito: pergunta de novo o emprestado
    expect(problema(r, HOJE_FIXO, 'valor_emprestado')?.campo).toBe('valor_emprestado');
    expect(problema(r, HOJE_FIXO)?.campo).toBe('valor_total_receber');
    r = preencherDireto(r, 'valor_emprestado', '800', HOJE_FIXO)!;
    expect(problema(r, HOJE_FIXO)).toBeNull();
    const i = completar(r, HOJE_FIXO)!;
    expect(i).toMatchObject({
      tipo: 'criar_operacao',
      dados: { cliente: 'Pedro Miquiles', valor_emprestado: 800, valor_total_receber: 1000, primeiro_vencimento: '2026-11-20', numero_parcelas: 1, periodicidade: 'mensal', data_emprestimo: HOJE_FIXO },
    });
  });
});

describe('preencherDireto (sem IA)', () => {
  const r = op({ cliente: 'A' });
  it('valores', () => {
    expect(preencherDireto(r, 'valor_emprestado', 'R$ 1.500,50', HOJE_FIXO)?.dados).toMatchObject({ valor_emprestado: 1500.5 });
    expect(preencherDireto(r, 'valor_emprestado', 'mil e quinhentos', HOJE_FIXO)).toBeNull();
    expect(preencherDireto(r, 'valor_emprestado', '0', HOJE_FIXO)).toBeNull();
    const pag: Rascunho = { tipo: 'registrar_pagamento', dados: { cliente: 'A', valor: null, data: null, forma: null } };
    expect(preencherDireto(pag, 'valor', '150', HOJE_FIXO)?.dados).toMatchObject({ valor: 150 });
    expect(preencherDireto(r, 'valor', '150', HOJE_FIXO)).toBeNull();
  });
  it('datas', () => {
    expect(preencherDireto(r, 'primeiro_vencimento', '20/11', HOJE_FIXO)?.dados).toMatchObject({ primeiro_vencimento: '2026-11-20' });
    expect(preencherDireto(r, 'primeiro_vencimento', 'dia 30', HOJE_FIXO)?.dados).toMatchObject({ primeiro_vencimento: '2026-10-30' });
    expect(preencherDireto(r, 'primeiro_vencimento', 'daqui 30 dias', HOJE_FIXO)).toBeNull(); // vai para a IA
  });
  it('nome, cliente e documento', () => {
    const cad: Rascunho = { tipo: 'criar_cliente', dados: { nome: null, apelidos: [], telefone: null, documento: null } };
    expect(preencherDireto(cad, 'nome', 'Pedro Miquiles', HOJE_FIXO)?.dados).toMatchObject({ nome: 'Pedro Miquiles' });
    expect(preencherDireto(cad, 'nome', 'pedro miquiles 11219819417', HOJE_FIXO)).toBeNull(); // nome+doc → IA
    expect(preencherDireto(cad, 'documento', '529.982.247-25', HOJE_FIXO)?.dados).toMatchObject({ documento: '529.982.247-25' });
    expect(preencherDireto(cad, 'documento', '123', HOJE_FIXO)).toBeNull();
    expect(preencherDireto(cad, 'cliente', 'Pedro', HOJE_FIXO)).toBeNull();
    expect(preencherDireto(op({}), 'cliente', 'emprestei 10', HOJE_FIXO)).toBeNull();
    expect(preencherDireto(op({}), 'alteracao', 'dia 30', HOJE_FIXO)).toBeNull();
  });
});

describe('mesclar e problema', () => {
  it('só campos preenchidos sobrescrevem', () => {
    const base = op({ cliente: 'Pedro', valor_total_receber: 1000 });
    const nova = op({ valor_emprestado: 800, valor_total_receber: null });
    expect(mesclar(base, nova).dados).toMatchObject({ cliente: 'Pedro', valor_emprestado: 800, valor_total_receber: 1000 });
    const outro: Rascunho = { tipo: 'registrar_pagamento', dados: { cliente: 'X', valor: 1, data: null, forma: null } };
    expect(mesclar(base, outro)).toBe(outro);
  });
  it('vencimento antes do empréstimo', () => {
    expect(problema(op({ primeiro_vencimento: HOJE_FIXO }), HOJE_FIXO)?.campo).toBe('primeiro_vencimento');
    expect(problema({ tipo: 'criar_cliente', dados: { nome: null, apelidos: [], telefone: null, documento: null } }, HOJE_FIXO)).toBeNull();
  });
});

describe('textos', () => {
  const reais = (v: number) => `R$ ${v}`;
  const data = (d: string) => d;
  it('resumo do que já se sabe', () => {
    expect(resumoParcial(op({ cliente: 'Ana <b>', valor_emprestado: 500, valor_total_receber: 600, primeiro_vencimento: '2026-10-23', numero_parcelas: 4, periodicidade: 'semanal' }), reais, data)).toBe(
      '📝 Novo empréstimo: para <b>Ana &lt;b&gt;</b> · emprestado R$ 500 · recebe R$ 600 · vence 2026-10-23 · 4x semanal',
    );
    expect(resumoParcial(op({}), reais, data)).toBe('📝 Novo empréstimo');
    expect(resumoParcial({ tipo: 'registrar_pagamento', dados: { cliente: 'A', valor: 5, data: null, forma: null } }, reais, data)).toBe('💰 Pagamento: de <b>A</b> · R$ 5');
    expect(resumoParcial({ tipo: 'registrar_pagamento', dados: { cliente: null, valor: null, data: null, forma: null } }, reais, data)).toBe('💰 Pagamento');
    expect(resumoParcial(PARCIAIS[1]!.esperado as Rascunho, reais, data)).toBe('👤 Novo cliente');
    expect(resumoParcial({ tipo: 'prorrogar', dados: { cliente: null, novo_vencimento: null, acrescimo: null } }, reais, data)).toBe('📅 Prorrogação');
  });
  it('perguntas', () => {
    const pag: Rascunho = { tipo: 'registrar_pagamento', dados: { cliente: null, valor: null, data: null, forma: null } };
    const pro: Rascunho = { tipo: 'prorrogar', dados: { cliente: null, novo_vencimento: null, acrescimo: null } };
    expect(pergunta('cliente', op({}))).toContain('Para quem');
    expect(pergunta('cliente', pag)).toContain('Quem pagou');
    expect(pergunta('cliente', pro)).toContain('qual cliente');
    for (const c of ['valor_total_receber', 'primeiro_vencimento', 'valor', 'alteracao', 'nome', 'documento'] as const) {
      expect(pergunta(c, op({})).length).toBeGreaterThan(5);
    }
  });
  it('completar outros tipos', () => {
    expect(completar(op({}), HOJE_FIXO)).toBeNull();
    expect(completar({ tipo: 'registrar_pagamento', dados: { cliente: 'A', valor: 5, data: null, forma: null } }, HOJE_FIXO)?.dados).toMatchObject({ data: HOJE_FIXO });
    expect(completar({ tipo: 'prorrogar', dados: { cliente: 'A', novo_vencimento: '2026-12-01', acrescimo: null } }, HOJE_FIXO)?.tipo).toBe('prorrogar');
    expect(completar({ tipo: 'criar_cliente', dados: { nome: 'A', apelidos: [], telefone: null, documento: null } }, HOJE_FIXO)?.tipo).toBe('criar_cliente');
  });
});
