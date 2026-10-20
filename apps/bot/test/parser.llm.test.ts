import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { InterpretadorClaude } from '../src/ia/interpretador';
import { CLIENTES_FIXO, HOJE_FIXO, MENSAGENS } from './fixtures';

/**
 * Teste contra a API real (custa tokens). Rode com `pnpm test:llm` e ANTHROPIC_API_KEY definida.
 * Compara os campos essenciais com o gabarito das fixtures.
 */
const modelo = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5';

describe.skipIf(!process.env.ANTHROPIC_API_KEY)(`parser com ${modelo}`, () => {
  const ia = new InterpretadorClaude(new Anthropic(), modelo);
  const ctx = { hoje: HOJE_FIXO, timezone: 'America/Sao_Paulo', clientes: CLIENTES_FIXO };

  it.each(MENSAGENS)('$texto', async ({ texto, esperado }) => {
    const r = await ia.interpretar(texto, ctx);
    expect(r.tipo).toBe(esperado.tipo);
    if (r.tipo !== esperado.tipo) return;
    const d = r.dados as Record<string, unknown>;
    const e = esperado.dados as Record<string, unknown>;
    // Campos que importam; texto livre (observações/forma) não é comparado.
    for (const k of ['cliente', 'valor_emprestado', 'valor_total_receber', 'numero_parcelas', 'periodicidade', 'primeiro_vencimento', 'valor', 'acrescimo', 'tipo']) {
      if (k in e) expect(d[k], k).toEqual(e[k]);
    }
    if (esperado.tipo === 'consultar' && esperado.dados.tipo === 'a_receber_periodo') {
      expect(d.data_inicio).toBe(esperado.dados.data_inicio);
      expect(d.data_fim).toBe(esperado.dados.data_fim);
    }
  });

  it('pede esclarecimento quando falta valor', async () => {
    const r = await ia.interpretar('emprestei pro Carlos', ctx);
    expect(r.tipo).toBe('pedir_esclarecimento');
  });

  it('aplica correção sobre o rascunho', async () => {
    const r = await ia.interpretar('na verdade volta 2500', { ...ctx, rascunho: MENSAGENS[0]!.esperado });
    expect(r).toMatchObject({ tipo: 'criar_operacao', dados: { valor_total_receber: 2500, valor_emprestado: 2000, primeiro_vencimento: '2026-12-15' } });
  });
});
