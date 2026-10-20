import type { Intencao } from '../src/ia/ferramentas';

/** Data fixa das fixtures do parser: terça-feira. */
export const HOJE_FIXO = '2026-10-20';

export const CLIENTES_FIXO = [
  { nome: 'Carlos Souza', apelidos: ['Carlão'] },
  { nome: 'Ana Paula', apelidos: ['Aninha'] },
  { nome: 'Beatriz Lima', apelidos: ['Bia'] },
  { nome: 'João Pedro', apelidos: ['JP', 'Joãozinho'] },
  { nome: 'Marcos Silva', apelidos: [] },
];

/**
 * As frases de exemplo do documento do produto e a intenção esperada.
 * Usadas (a) como respostas gravadas nos testes determinísticos e
 * (b) como gabarito no teste contra a API real (`pnpm test:llm`).
 */
export const MENSAGENS: { texto: string; esperado: Intencao }[] = [
  {
    texto: 'emprestei 2000 pro Carlos, volta 2400 dia 15/12',
    esperado: {
      tipo: 'criar_operacao',
      dados: {
        cliente: 'Carlos Souza',
        valor_emprestado: 2000,
        valor_total_receber: 2400,
        numero_parcelas: 1,
        periodicidade: 'mensal',
        primeiro_vencimento: '2026-12-15',
        data_emprestimo: HOJE_FIXO,
        observacoes: null,
      },
    },
  },
  {
    texto: 'Ana pegou 500, paga 600 em 4x semanais começando sexta',
    esperado: {
      tipo: 'criar_operacao',
      dados: {
        cliente: 'Ana Paula',
        valor_emprestado: 500,
        valor_total_receber: 600,
        numero_parcelas: 4,
        periodicidade: 'semanal',
        primeiro_vencimento: '2026-10-23',
        data_emprestimo: HOJE_FIXO,
        observacoes: null,
      },
    },
  },
  {
    texto: 'Carlos pagou 1200',
    esperado: { tipo: 'registrar_pagamento', dados: { cliente: 'Carlos Souza', valor: 1200, data: HOJE_FIXO, forma: null } },
  },
  {
    texto: 'joga o vencimento do Carlos pro dia 30 com mais 100',
    esperado: { tipo: 'prorrogar', dados: { cliente: 'Carlos Souza', novo_vencimento: '2026-10-30', acrescimo: 100 } },
  },
  {
    texto: 'quanto entra essa semana?',
    esperado: {
      tipo: 'consultar',
      dados: { tipo: 'a_receber_periodo', cliente: null, data_inicio: '2026-10-19', data_fim: '2026-10-25' },
    },
  },
  {
    texto: 'quem tá atrasado?',
    esperado: { tipo: 'consultar', dados: { tipo: 'atrasados', cliente: null, data_inicio: null, data_fim: null } },
  },
  {
    texto: 'saldo da Ana',
    esperado: { tipo: 'consultar', dados: { tipo: 'saldo_cliente', cliente: 'Ana Paula', data_inicio: null, data_fim: null } },
  },
];
