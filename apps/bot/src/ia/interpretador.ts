import Anthropic from '@anthropic-ai/sdk';
import { diaSemana, inicioSemana, somarDias, type DataISO } from '@cobra/core';
import { FERRAMENTAS, SCHEMAS, type Intencao, type NomeFerramenta } from './ferramentas';

const DIAS = ['', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];

/**
 * Prompt estável (fica em cache junto com as tools). Nada que muda por mensagem entra aqui:
 * data, clientes e rascunho vão na mensagem do usuário.
 */
export const PROMPT_SISTEMA = `Você interpreta mensagens em português (Brasil) enviadas a um assistente pessoal de controle de empréstimos de dinheiro.
O usuário é quem empresta: ele empresta um valor e recebe um valor maior depois.

Responda SEMPRE chamando exatamente uma ferramenta. Não escreva texto fora da ferramenta.

Regras:
- Valores: "2000", "2 mil", "2k", "R$ 2.000,00" → 2000. Use reais (não centavos).
- Datas: devolva sempre YYYY-MM-DD, resolvendo expressões relativas a partir da data de hoje informada.
  "dia 15" = próximo dia 15 a partir de hoje (inclusive). "15/12" = 15 de dezembro (deste ano, ou do próximo se já passou).
  "sexta" = próxima sexta-feira; se hoje é sexta, a de hoje. "daqui 20 dias" = hoje + 20. "amanhã" = hoje + 1.
- "volta 2400", "paga 600", "devolve 600" = valor_total_receber.
- "em 4x semanais começando sexta" → numero_parcelas 4, periodicidade semanal, primeiro_vencimento = próxima sexta.
- "4x de 150" → valor_total_receber 600.
- Parcela única: numero_parcelas 1, periodicidade "mensal".
- Clientes: use o nome exatamente como na lista quando o usuário usar nome, primeiro nome ou apelido de alguém da lista.
  Se houver mais de um candidato, devolva o que o usuário digitou (o sistema vai perguntar). Se não estiver na lista, devolva como digitado.
- "pagou", "acertou", "mandou" = registrar_pagamento.
- "joga o vencimento", "adia", "prorroga", "empurra" = prorrogar. "com mais 100" = acrescimo 100.
- Perguntas ("quanto entra", "quem tá atrasado", "saldo da Ana", "como tá a carteira") = consultar.
  "essa semana" = semana atual (segunda a domingo) informada no contexto; "hoje" = data_inicio e data_fim iguais a hoje; "esse mês" = do dia 1 ao último dia do mês.
- Se faltar informação essencial (quem, quanto, quando) ou a mensagem não for sobre empréstimos, use pedir_esclarecimento. Nunca invente valores.
- Quando houver um RASCUNHO no contexto, a mensagem é uma correção dele: devolva a mesma ferramenta com os campos corrigidos e os demais mantidos.`;

export interface ContextoInterpretacao {
  hoje: DataISO;
  timezone: string;
  clientes: readonly { nome: string; apelidos: readonly string[] }[];
  /** Intenção pendente sendo corrigida (fluxo ✏️ Editar). */
  rascunho?: Intencao | null;
}

export function montarContexto(ctx: ContextoInterpretacao): string {
  const seg = inicioSemana(ctx.hoje);
  const linhas = [
    `Hoje: ${ctx.hoje} (${DIAS[diaSemana(ctx.hoje)]}), timezone ${ctx.timezone}.`,
    `Semana atual: ${seg} a ${somarDias(seg, 6)}.`,
    'Clientes cadastrados:',
    ...(ctx.clientes.length
      ? ctx.clientes.map((c) => `- ${c.nome}${c.apelidos.length ? ` (apelidos: ${c.apelidos.join(', ')})` : ''}`)
      : ['(nenhum)']),
  ];
  if (ctx.rascunho) {
    linhas.push(`RASCUNHO (${ctx.rascunho.tipo}): ${JSON.stringify(ctx.rascunho.dados)}`);
  }
  return linhas.join('\n');
}

export type ResultadoInterpretacao = Intencao | { tipo: 'falha'; motivo: string };

export interface Interpretador {
  interpretar(texto: string, ctx: ContextoInterpretacao): Promise<ResultadoInterpretacao>;
}

/** Converte o retorno do modelo numa intenção validada. Exportada para testes com respostas gravadas. */
export function extrairIntencao(resposta: Pick<Anthropic.Message, 'content' | 'stop_reason'>): ResultadoInterpretacao {
  if (resposta.stop_reason === 'refusal') return { tipo: 'falha', motivo: 'recusa' };
  if (resposta.stop_reason === 'max_tokens') return { tipo: 'falha', motivo: 'resposta_truncada' };
  const bloco = resposta.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!bloco) return { tipo: 'falha', motivo: 'sem_ferramenta' };
  const nome = bloco.name as NomeFerramenta;
  const schema = SCHEMAS[nome];
  if (!schema) return { tipo: 'falha', motivo: `ferramenta_desconhecida:${bloco.name}` };
  const r = schema.safeParse(bloco.input);
  if (!r.success) return { tipo: 'falha', motivo: `entrada_invalida:${r.error.issues[0]?.message ?? ''}` };
  return { tipo: nome, dados: r.data } as Intencao;
}

export class InterpretadorClaude implements Interpretador {
  constructor(
    private readonly client: Anthropic,
    private readonly modelo: string,
  ) {}

  async interpretar(texto: string, ctx: ContextoInterpretacao): Promise<ResultadoInterpretacao> {
    try {
      const resposta = await this.client.messages.create({
        model: this.modelo,
        max_tokens: 4000,
        // Extração simples: esforço baixo reduz custo e latência.
        output_config: { effort: 'low' },
        system: [{ type: 'text', text: PROMPT_SISTEMA, cache_control: { type: 'ephemeral' } }],
        tools: FERRAMENTAS,
        tool_choice: { type: 'auto', disable_parallel_tool_use: true },
        messages: [
          {
            role: 'user',
            content: `${montarContexto(ctx)}\n\nMensagem do usuário:\n${texto}`,
          },
        ],
      });
      return extrairIntencao(resposta);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return { tipo: 'falha', motivo: 'limite_de_uso' };
      if (e instanceof Anthropic.APIError) return { tipo: 'falha', motivo: `api_${e.status ?? 'erro'}` };
      return { tipo: 'falha', motivo: 'erro_rede' };
    }
  }
}
