import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { InterpretadorClaude } from '../src/ia/interpretador';
import { ehRascunho } from '../src/rascunho';
import { BUSCAS, CLIENTES_FIXO, HOJE_FIXO, MENSAGENS, PARCIAIS } from './fixtures';

/**
 * Teste contra a API real (custa tokens). Rode com `pnpm test:llm` e ANTHROPIC_API_KEY definida.
 * Compara os campos essenciais com o gabarito das fixtures.
 */
const modelo = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5';

describe.skipIf(!process.env.ANTHROPIC_API_KEY)(`parser com ${modelo}`, () => {
  const ia = new InterpretadorClaude(new Anthropic(), modelo);
  const ctx = { hoje: HOJE_FIXO, timezone: 'America/Sao_Paulo', clientes: CLIENTES_FIXO };

  // "cadastro" e afins não passam pela IA (atalhos.intencaoRapida).
  it.each([...MENSAGENS, ...PARCIAIS.filter((p) => p.texto !== 'cadastro')])('$texto', async ({ texto, esperado }) => {
    const r = await ia.interpretar(texto, ctx);
    expect(r.tipo).toBe(esperado.tipo);
    if (r.tipo !== esperado.tipo) return;
    const d = r.dados as Record<string, unknown>;
    const e = esperado.dados as Record<string, unknown>;
    // Campos que importam (o que foi dito e o que NÃO pode ser inventado). Parcela única: null ou 1/mensal.
    for (const k of ['cliente', 'nome', 'valor_emprestado', 'valor_total_receber', 'primeiro_vencimento', 'valor', 'acrescimo', 'tipo']) {
      if (k in e) expect(d[k] ?? null, k).toEqual(e[k]);
    }
    if (e.numero_parcelas) expect([d.numero_parcelas, d.periodicidade]).toEqual([e.numero_parcelas, e.periodicidade]);
    else if ('numero_parcelas' in e) expect([null, 1]).toContain(d.numero_parcelas);
    expect(ehRascunho(r) || r.tipo === 'consultar').toBe(true);
    if (esperado.tipo === 'consultar' && esperado.dados.tipo === 'a_receber_periodo') {
      expect(d.data_inicio).toBe(esperado.dados.data_inicio);
      expect(d.data_fim).toBe(esperado.dados.data_fim);
    }
  });

  it.each(BUSCAS)('busca: $texto', async ({ texto, esperado }) => {
    const r = await ia.interpretar(texto, ctx);
    expect(r).toMatchObject({ tipo: 'consultar', dados: { tipo: 'listar_clientes' } });
    // O filtro precisa casar com o cliente (nome completo ou parte dele)
    const filtro = String((r as { dados: { cliente: string | null } }).dados.cliente ?? '').toLowerCase();
    const alvo = String((esperado as { dados: { cliente: string } }).dados.cliente).toLowerCase();
    expect(alvo.includes(filtro) || filtro.includes(alvo)).toBe(true);
  });

  it('falta valor: abre rascunho sem inventar números', async () => {
    const r = await ia.interpretar('emprestei pro Carlos', ctx);
    expect(r).toMatchObject({ tipo: 'criar_operacao', dados: { cliente: 'Carlos Souza', valor_emprestado: null, valor_total_receber: null } });
  });

  it('saudação vira esclarecimento', async () => {
    expect((await ia.interpretar('olá', ctx)).tipo).toBe('pedir_esclarecimento');
  });

  it('aplica correção sobre o rascunho', async () => {
    const r = await ia.interpretar('na verdade volta 2500', { ...ctx, rascunho: MENSAGENS[0]!.esperado });
    expect(r).toMatchObject({ tipo: 'criar_operacao', dados: { valor_total_receber: 2500 } });
  });

  it('completa rascunho com nome + documento na mesma mensagem', async () => {
    const r = await ia.interpretar('pedro miquiles 52998224725', {
      ...ctx,
      rascunho: PARCIAIS[1]!.esperado,
      aguardando: 'Qual o nome completo do cliente?',
    });
    expect(r).toMatchObject({ tipo: 'criar_cliente', dados: { documento: expect.stringContaining('52998224725') } });
    expect(String((r as { dados: { nome: string } }).dados.nome).toLowerCase()).toBe('pedro miquiles');
  });
});
