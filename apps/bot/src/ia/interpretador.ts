import Anthropic from '@anthropic-ai/sdk';
import { diaSemana, inicioSemana, somarDias, type DataISO } from '@cobra/core';
import { FERRAMENTAS, SCHEMAS, type IntencaoParcial, type NomeFerramenta } from './ferramentas';

const DIAS = ['', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];

/**
 * Prompt estável (fica em cache junto com as tools). Nada que muda por mensagem entra aqui:
 * data, clientes e rascunho vão na mensagem do usuário.
 */
export const PROMPT_SISTEMA = `Você interpreta mensagens em português (Brasil) enviadas a um assistente pessoal de controle de empréstimos de dinheiro.
O usuário é quem empresta: ele empresta um valor e recebe um valor maior depois.

Responda SEMPRE chamando exatamente uma ferramenta. Não escreva texto fora da ferramenta.

Extração:
- Preencha SOMENTE o que a mensagem (ou o rascunho) disser. O que não foi dito vai como null: o sistema pergunta depois.
  Nunca invente nem deduza valores, datas ou nomes que não estejam no texto.
- Se a intenção estiver clara (empréstimo, pagamento, prorrogação, cadastro, consulta), use a ferramenta dela mesmo com campos null.
  pedir_esclarecimento é só para saudações, assuntos fora de empréstimos ou frases sem sentido.
- Valores: "2000", "2 mil", "2k", "R$ 2.000,00" → 2000 (em reais).
- valor_emprestado = o que saiu do bolso do usuário ("emprestei 2000", "pegou 500").
  valor_total_receber = o que volta ("volta 2400", "paga 600", "para receber 1000", "devolve 1200"). "4x de 150" → 600.
  Um valor sozinho sem indicar qual é ("1000 pro João") → valor_emprestado.
- Datas: sempre YYYY-MM-DD, resolvendo expressões relativas a partir de hoje.
  "dia 15" = próximo dia 15 (inclusive hoje). "15/12" = 15 de dezembro (deste ano, ou do próximo se já passou).
  "sexta" = próxima sexta-feira; se hoje é sexta, a de hoje. "daqui 20 dias" = hoje + 20. "amanhã" = hoje + 1.
  Dívida antiga/vencida ("venceu dia 19/10", "estava vencida", "atrasada desde 10/10", "cadastrar dívida antiga"): a data é no PASSADO.
  "emprestei em 01/09", "o empréstimo foi em 01/09" = data_emprestimo.
- "em 4x semanais começando sexta" → numero_parcelas 4, periodicidade semanal, primeiro_vencimento = próxima sexta.
  Sem menção a parcelas → numero_parcelas null e periodicidade null (o sistema assume parcela única).
- Cliente: use o nome exatamente como na lista quando o usuário usar nome, primeiro nome ou apelido de alguém da lista.
  Se houver mais de um candidato ou não estiver na lista, devolva como digitado. Número de CPF/CNPJ/documento vai em "documento".
- "cadastrar", "cadastro", "novo cliente" = criar_cliente. Corrigir/alterar/renomear um cliente que já existe = editar_cliente.
- "pagou", "acertou", "mandou" = registrar_pagamento. "pagou só os juros"/"pagou o juros"/"renovou" = registrar_pagamento com so_juros true (valor null se não disse). "joga o vencimento", "adia", "prorroga" = prorrogar; "com mais 100" = acrescimo 100.
- Perguntas ("quanto entra", "quem tá atrasado", "saldo da Ana") = consultar.
  "liste os clientes", "meus clientes", "clientes com Silva", "qual o CPF do Carlos?" = consultar listar_clientes (filtro em "cliente").
  resumo é só para visão geral da carteira ("como tá a carteira", "resumo").
  "essa semana" = semana atual informada no contexto; "hoje" = início e fim hoje; "esse mês" = do dia 1 ao último dia do mês.

RASCUNHO: quando o contexto trouxer um rascunho, a conversa está no meio de um lançamento. Se a mensagem responde ou corrige
o rascunho, devolva A MESMA ferramenta com os campos novos/corrigidos (pode repetir os já conhecidos ou deixá-los null).
Se a mensagem claramente muda de assunto (outra pergunta ou outro lançamento), use a ferramenta do novo assunto.`;

export interface ContextoInterpretacao {
  hoje: DataISO;
  timezone: string;
  clientes: readonly { nome: string; apelidos: readonly string[] }[];
  /** Lançamento em andamento (incompleto ou em edição ✏️). */
  rascunho?: IntencaoParcial | null;
  /** Campo que o bot acabou de perguntar, se houver. */
  aguardando?: string | null;
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
    if (ctx.aguardando) linhas.push(`O sistema acabou de perguntar: ${ctx.aguardando}`);
  }
  return linhas.join('\n');
}

export type ResultadoInterpretacao = IntencaoParcial | { tipo: 'falha'; motivo: string };

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
  return { tipo: nome, dados: r.data } as IntencaoParcial;
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
      if (e instanceof Anthropic.APIError) return { tipo: 'falha', motivo: `api_${e.status ?? 'erro'}: ${e.message.slice(0, 300)}` };
      return { tipo: 'falha', motivo: 'erro_rede' };
    }
  }
}
