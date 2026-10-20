import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { intencaoRapida, parseNovo, parsePagar } from '../src/atalhos';
import { FERRAMENTAS } from '../src/ia/ferramentas';
import { extrairIntencao, montarContexto, PROMPT_SISTEMA } from '../src/ia/interpretador';
import { CLIENTES_FIXO, HOJE_FIXO, MENSAGENS, PARCIAIS } from './fixtures';

/** Resposta gravada do modelo: um bloco tool_use com a intenção esperada. */
function respostaGravada(nome: string, input: unknown, stop: Anthropic.Message['stop_reason'] = 'tool_use') {
  return {
    stop_reason: stop,
    content: [{ type: 'tool_use', id: 'toolu_1', name: nome, input, caller: { type: 'direct' } }] as Anthropic.ContentBlock[],
  };
}

describe('extrairIntencao (respostas gravadas das frases de exemplo)', () => {
  it.each([...MENSAGENS, ...PARCIAIS])('$texto', ({ esperado }) => {
    expect(extrairIntencao(respostaGravada(esperado.tipo, esperado.dados))).toEqual(esperado);
  });

  it('falha sem tool_use (modelo respondeu texto)', () => {
    const r = extrairIntencao({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'oi', citations: null }] as Anthropic.ContentBlock[] });
    expect(r).toEqual({ tipo: 'falha', motivo: 'sem_ferramenta' });
  });
  it('falha com entrada inválida (não chuta)', () => {
    const r = extrairIntencao(respostaGravada('registrar_pagamento', { cliente: 'Carlos', valor: -5, data: null, forma: null }));
    expect(r.tipo).toBe('falha');
  });
  it('falha com ferramenta desconhecida, recusa ou truncamento', () => {
    expect(extrairIntencao(respostaGravada('apagar_tudo', {})).tipo).toBe('falha');
    expect(extrairIntencao(respostaGravada('consultar', {}, 'refusal'))).toEqual({ tipo: 'falha', motivo: 'recusa' });
    expect(extrairIntencao(respostaGravada('consultar', {}, 'max_tokens'))).toEqual({ tipo: 'falha', motivo: 'resposta_truncada' });
  });
});

describe('prompt e contexto', () => {
  it('contexto traz data, dia da semana, semana atual e clientes', () => {
    const t = montarContexto({ hoje: HOJE_FIXO, timezone: 'America/Sao_Paulo', clientes: CLIENTES_FIXO });
    expect(t).toContain('Hoje: 2026-10-20 (terça-feira)');
    expect(t).toContain('Semana atual: 2026-10-19 a 2026-10-25');
    expect(t).toContain('Carlos Souza (apelidos: Carlão)');
    expect(t).toMatch(/^- Marcos Silva$/m);
  });
  it('rascunho entra no contexto no fluxo de edição', () => {
    const t = montarContexto({ hoje: HOJE_FIXO, timezone: 'UTC', clientes: [], rascunho: MENSAGENS[0]!.esperado });
    expect(t).toContain('(nenhum)');
    expect(t).toContain('RASCUNHO (criar_operacao)');
  });
  it('prompt de sistema é estável (cacheável): sem datas', () => {
    expect(PROMPT_SISTEMA).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
  it('tools fecham additionalProperties; strict cabe no limite de 16 parâmetros anuláveis', () => {
    let unioes = 0;
    for (const t of FERRAMENTAS) {
      if (t.strict) {
        unioes += Object.values(t.input_schema.properties).filter(
          (p) => Array.isArray((p as { type?: unknown }).type) || 'anyOf' in (p as object),
        ).length;
      }
      expect(t.input_schema.additionalProperties).toBe(false);
      expect([...t.input_schema.required].sort()).toEqual(Object.keys(t.input_schema.properties).sort());
    }
    expect(unioes).toBeLessThanOrEqual(16);
  });
});

describe('atalhos sem IA', () => {
  it('palavras-chave abrem rascunho', () => {
    expect(intencaoRapida('cadastro')).toEqual(PARCIAIS[1]!.esperado);
    expect(intencaoRapida('Novo cliente!')?.tipo).toBe('criar_cliente');
    expect(intencaoRapida('novo empréstimo')?.tipo).toBe('criar_operacao');
    expect(intencaoRapida('Pagamento')?.tipo).toBe('registrar_pagamento');
    expect(intencaoRapida('cadastro do Pedro 123')).toBeNull();
    expect(intencaoRapida('olá')).toBeNull();
  });

  it('/novo parcela única', () => {
    expect(parseNovo('Carlos 2000 2400 15/12', HOJE_FIXO)).toEqual({
      tipo: 'criar_operacao',
      dados: {
        cliente: 'Carlos',
        documento: null,
        valor_emprestado: 2000,
        valor_total_receber: 2400,
        numero_parcelas: 1,
        periodicidade: 'mensal',
        primeiro_vencimento: '2026-12-15',
        data_emprestimo: HOJE_FIXO,
        observacoes: null,
      },
    });
  });
  it('/novo parcelado com nome composto', () => {
    const r = parseNovo('Ana Paula 500 600 23/10 4x semanal', HOJE_FIXO);
    expect(r).toMatchObject({ dados: { cliente: 'Ana Paula', numero_parcelas: 4, periodicidade: 'semanal', primeiro_vencimento: '2026-10-23' } });
  });
  it('/novo inválido', () => {
    expect(parseNovo('', HOJE_FIXO)).toHaveProperty('erro');
    expect(parseNovo('Carlos 2000', HOJE_FIXO)).toHaveProperty('erro');
    expect(parseNovo('Carlos 2000 2400 15/12 talvez', HOJE_FIXO)).toHaveProperty('erro');
  });
  it('/pagar', () => {
    expect(parsePagar('Carlos 1.200,50', HOJE_FIXO)).toEqual({
      tipo: 'registrar_pagamento',
      dados: { cliente: 'Carlos', valor: 1200.5, data: HOJE_FIXO, forma: null },
    });
    expect(parsePagar('Carlos 100 15/10', HOJE_FIXO)).toMatchObject({ dados: { data: '2026-10-15' } });
    expect(parsePagar('Carlos', HOJE_FIXO)).toHaveProperty('erro');
    expect(parsePagar('Carlos 100 amanhã', HOJE_FIXO)).toHaveProperty('erro');
  });
});
