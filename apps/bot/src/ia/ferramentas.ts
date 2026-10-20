import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

/**
 * Uma tool por intenção. Os schemas são `strict` (o modelo só devolve JSON válido), exceto
 * criar_operacao (ver comentário nela); o zod valida tudo de novo do lado de cá antes de usar.
 *
 * O modelo extrai SÓ o que foi dito: campos não informados vêm `null` e o bot pergunta
 * um a um (ver `rascunho.ts`). Valores monetários em reais; viram centavos depois.
 */

const nulo = <T extends object>(s: T, descricao: string) => ({ ...s, description: `${descricao} null se não foi dito.` });
const texto = { type: ['string', 'null'] } as const;
const numero = { type: ['number', 'null'] } as const;
const data = { type: ['string', 'null'] } as const;

export const FERRAMENTAS = [
  {
    name: 'criar_operacao',
    description:
      'Registrar um novo empréstimo: o usuário emprestou dinheiro a alguém e vai receber um valor (maior) depois, em parcela única ou parcelado. Use mesmo que faltem dados: preencha o que foi dito e deixe null o resto.',
    // Sem `strict`: a API limita a 16 parâmetros anuláveis somando todas as tools strict, e esta
    // sozinha tem 9. A entrada é validada pelo zod (SCHEMAS) antes de qualquer uso.
    strict: false,
    input_schema: {
      type: 'object',
      properties: {
        cliente: nulo(texto, 'Nome do cliente como aparece na lista, ou como foi digitado se não estiver na lista.'),
        documento: nulo(texto, 'CPF, CNPJ ou outro documento do cliente, como digitado.'),
        valor_emprestado: nulo(numero, 'Valor emprestado (que saiu do bolso do usuário), em reais.'),
        valor_total_receber: nulo(
          numero,
          'Valor TOTAL que o usuário vai receber de volta (soma das parcelas), em reais. Se disser o valor de cada parcela, multiplique.',
        ),
        numero_parcelas: nulo({ type: ['integer', 'null'] }, '1 para parcela única.'),
        periodicidade: {
          anyOf: [{ type: 'string', enum: ['semanal', 'quinzenal', 'mensal'] }, { type: 'null' }],
          description: 'Frequência das parcelas. null se não foi dito.',
        },
        primeiro_vencimento: nulo(data, 'Data (YYYY-MM-DD) do primeiro (ou único) vencimento.'),
        data_emprestimo: nulo(data, 'Data (YYYY-MM-DD) do empréstimo, se o usuário disser uma data diferente de hoje.'),
        observacoes: texto,
      },
      required: [
        'cliente',
        'documento',
        'valor_emprestado',
        'valor_total_receber',
        'numero_parcelas',
        'periodicidade',
        'primeiro_vencimento',
        'data_emprestimo',
        'observacoes',
      ],
      additionalProperties: false,
    },
  },
  {
    name: 'registrar_pagamento',
    description: 'Registrar que um cliente pagou (total ou parcialmente) um valor.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        cliente: nulo(texto, 'Nome do cliente.'),
        valor: nulo(numero, 'Valor pago, em reais.'),
        data: nulo(data, 'Data (YYYY-MM-DD) do pagamento, se diferente de hoje.'),
        forma: nulo(texto, 'pix, dinheiro, transferência…'),
      },
      required: ['cliente', 'valor', 'data', 'forma'],
      additionalProperties: false,
    },
  },
  {
    name: 'prorrogar',
    description:
      'Adiar o vencimento e/ou acrescentar (ou descontar) valor na próxima parcela em aberto de um cliente. Ex.: "joga pro dia 30 com mais 100".',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        cliente: nulo(texto, 'Nome do cliente.'),
        novo_vencimento: nulo(data, 'Nova data (YYYY-MM-DD).'),
        acrescimo: nulo(numero, 'Reais a somar na parcela (negativo para desconto).'),
      },
      required: ['cliente', 'novo_vencimento', 'acrescimo'],
      additionalProperties: false,
    },
  },
  {
    name: 'consultar',
    description: 'Responder perguntas sobre a carteira (nada é gravado).',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: ['a_receber_periodo', 'atrasados', 'saldo_cliente', 'resumo'],
          description:
            'a_receber_periodo: quanto entra num período; atrasados: quem está devendo; saldo_cliente: situação de um cliente; resumo: visão geral',
        },
        cliente: texto,
        data_inicio: nulo(data, 'Início do período (YYYY-MM-DD).'),
        data_fim: nulo(data, 'Fim do período (YYYY-MM-DD).'),
      },
      required: ['tipo', 'cliente', 'data_inicio', 'data_fim'],
      additionalProperties: false,
    },
  },
  {
    name: 'criar_cliente',
    description: 'Cadastrar um novo cliente (sem empréstimo). Use mesmo que o nome ou o documento ainda não tenham sido ditos.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        nome: nulo(texto, 'Nome completo.'),
        apelidos: { type: 'array', items: { type: 'string' } },
        telefone: texto,
        documento: nulo(texto, 'CPF, CNPJ ou outro documento, como digitado.'),
      },
      required: ['nome', 'apelidos', 'telefone', 'documento'],
      additionalProperties: false,
    },
  },
  {
    name: 'pedir_esclarecimento',
    description:
      'Use SÓ quando não der para saber o que o usuário quer (saudação, assunto fora de empréstimos, frase sem sentido). Se a intenção for clara e só faltarem dados, use a ferramenta da intenção com null nos campos que faltam.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { pergunta: { type: 'string', description: 'Resposta/pergunta curta, em português, para o usuário' } },
      required: ['pergunta'],
      additionalProperties: false,
    },
  },
] satisfies Anthropic.Tool[];

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reais = z.number().finite();
const periodicidade = z.enum(['semanal', 'quinzenal', 'mensal']);

/** O que o modelo devolve: campos não ditos vêm null. */
export const SCHEMAS = {
  criar_operacao: z.object({
    cliente: z.string().min(1).nullable(),
    documento: z.string().nullable(),
    valor_emprestado: reais.positive().nullable(),
    valor_total_receber: reais.positive().nullable(),
    numero_parcelas: z.number().int().min(1).max(120).nullable(),
    periodicidade: periodicidade.nullable(),
    primeiro_vencimento: dataISO.nullable(),
    data_emprestimo: dataISO.nullable(),
    observacoes: z.string().nullable(),
  }),
  registrar_pagamento: z.object({
    cliente: z.string().min(1).nullable(),
    valor: reais.positive().nullable(),
    data: dataISO.nullable(),
    forma: z.string().nullable(),
  }),
  prorrogar: z.object({
    cliente: z.string().min(1).nullable(),
    novo_vencimento: dataISO.nullable(),
    acrescimo: reais.nullable(),
  }),
  consultar: z.object({
    tipo: z.enum(['a_receber_periodo', 'atrasados', 'saldo_cliente', 'resumo']),
    cliente: z.string().nullable(),
    data_inicio: dataISO.nullable(),
    data_fim: dataISO.nullable(),
  }),
  criar_cliente: z.object({
    nome: z.string().min(1).nullable(),
    apelidos: z.array(z.string()),
    telefone: z.string().nullable(),
    documento: z.string().nullable(),
  }),
  pedir_esclarecimento: z.object({ pergunta: z.string().min(1) }),
} as const;

export type NomeFerramenta = keyof typeof SCHEMAS;

/** Intenção como o modelo devolve (pode estar incompleta). */
export type IntencaoParcial = {
  [K in NomeFerramenta]: { tipo: K; dados: z.infer<(typeof SCHEMAS)[K]> };
}[NomeFerramenta];

type Dados<K extends NomeFerramenta> = Extract<IntencaoParcial, { tipo: K }>['dados'];

/** Intenção pronta para virar plano: campos essenciais garantidos (ver `rascunho.ts`). */
export type Intencao =
  | {
      tipo: 'criar_operacao';
      dados: Omit<Dados<'criar_operacao'>, 'cliente' | 'valor_emprestado' | 'valor_total_receber' | 'numero_parcelas' | 'periodicidade' | 'primeiro_vencimento' | 'data_emprestimo'> & {
        cliente: string;
        valor_emprestado: number;
        valor_total_receber: number;
        numero_parcelas: number;
        periodicidade: z.infer<typeof periodicidade>;
        primeiro_vencimento: string;
        data_emprestimo: string;
      };
    }
  | { tipo: 'registrar_pagamento'; dados: Omit<Dados<'registrar_pagamento'>, 'cliente' | 'valor' | 'data'> & { cliente: string; valor: number; data: string } }
  | { tipo: 'prorrogar'; dados: Omit<Dados<'prorrogar'>, 'cliente'> & { cliente: string } }
  | { tipo: 'consultar'; dados: Dados<'consultar'> }
  | { tipo: 'criar_cliente'; dados: Dados<'criar_cliente'> }
  | { tipo: 'pedir_esclarecimento'; dados: Dados<'pedir_esclarecimento'> };
