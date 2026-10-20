import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

/**
 * Uma tool por intenção. Os schemas são `strict` (o modelo só devolve JSON válido),
 * e o zod valida de novo do lado de cá antes de qualquer uso.
 * Valores monetários chegam em reais (number) e são convertidos para centavos depois.
 */

const data = { type: 'string', description: 'Data no formato YYYY-MM-DD' } as const;
const dataOuNulo = { type: ['string', 'null'], description: 'Data YYYY-MM-DD, ou null se não informada' } as const;

export const FERRAMENTAS = [
  {
    name: 'criar_operacao',
    description:
      'Registrar um novo empréstimo: o usuário emprestou dinheiro a alguém e vai receber um valor maior depois, em parcela única ou parcelado.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        cliente: { type: 'string', description: 'Nome do cliente como aparece na lista, ou como foi digitado se não estiver na lista' },
        valor_emprestado: { type: 'number', description: 'Valor emprestado, em reais' },
        valor_total_receber: {
          type: 'number',
          description: 'Valor TOTAL a receber (soma de todas as parcelas), em reais. Se o usuário disser o valor de cada parcela, multiplique.',
        },
        numero_parcelas: { type: 'integer', description: '1 para parcela única' },
        periodicidade: { type: 'string', enum: ['semanal', 'quinzenal', 'mensal'], description: 'Use "mensal" para parcela única' },
        primeiro_vencimento: data,
        data_emprestimo: { ...data, description: 'Data do empréstimo (YYYY-MM-DD). Hoje, se não for dita.' },
        observacoes: { type: ['string', 'null'] },
      },
      required: [
        'cliente',
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
        cliente: { type: 'string' },
        valor: { type: 'number', description: 'Valor pago, em reais' },
        data: { ...data, description: 'Data do pagamento (YYYY-MM-DD). Hoje, se não for dita.' },
        forma: { type: ['string', 'null'], description: 'pix, dinheiro, transferência… ou null' },
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
        cliente: { type: 'string' },
        novo_vencimento: dataOuNulo,
        acrescimo: { type: ['number', 'null'], description: 'Reais a somar na parcela (negativo para desconto), ou null' },
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
        cliente: { type: ['string', 'null'] },
        data_inicio: dataOuNulo,
        data_fim: dataOuNulo,
      },
      required: ['tipo', 'cliente', 'data_inicio', 'data_fim'],
      additionalProperties: false,
    },
  },
  {
    name: 'criar_cliente',
    description: 'Cadastrar um novo cliente (sem empréstimo).',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        apelidos: { type: 'array', items: { type: 'string' } },
        telefone: { type: ['string', 'null'] },
        documento: { type: ['string', 'null'], description: 'CPF, CNPJ ou outro documento como digitado, ou null se não informado' },
      },
      required: ['nome', 'apelidos', 'telefone', 'documento'],
      additionalProperties: false,
    },
  },
  {
    name: 'pedir_esclarecimento',
    description:
      'Use quando a mensagem for ambígua, faltar informação essencial (valor, cliente, data) ou não for sobre empréstimos. Nunca invente valores.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { pergunta: { type: 'string', description: 'Pergunta curta, em português, para o usuário' } },
      required: ['pergunta'],
      additionalProperties: false,
    },
  },
] satisfies Anthropic.Tool[];

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reais = z.number().finite();

export const SCHEMAS = {
  criar_operacao: z.object({
    cliente: z.string().min(1),
    valor_emprestado: reais.positive(),
    valor_total_receber: reais.positive(),
    numero_parcelas: z.number().int().min(1).max(120),
    periodicidade: z.enum(['semanal', 'quinzenal', 'mensal']),
    primeiro_vencimento: dataISO,
    data_emprestimo: dataISO,
    observacoes: z.string().nullable(),
  }),
  registrar_pagamento: z.object({
    cliente: z.string().min(1),
    valor: reais.positive(),
    data: dataISO,
    forma: z.string().nullable(),
  }),
  prorrogar: z.object({
    cliente: z.string().min(1),
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
    nome: z.string().min(1),
    apelidos: z.array(z.string()),
    telefone: z.string().nullable(),
    documento: z.string().nullable(),
  }),
  pedir_esclarecimento: z.object({ pergunta: z.string().min(1) }),
} as const;

export type NomeFerramenta = keyof typeof SCHEMAS;
export type Intencao = {
  [K in NomeFerramenta]: { tipo: K; dados: z.infer<(typeof SCHEMAS)[K]> };
}[NomeFerramenta];
