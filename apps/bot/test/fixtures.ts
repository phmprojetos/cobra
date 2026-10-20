import type { IntencaoParcial } from '../src/ia/ferramentas';

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
 * As frases de exemplo do documento do produto e o que o modelo deve extrair
 * (campos não ditos ficam null; o bot completa com padrões ou pergunta).
 * Usadas (a) como respostas gravadas nos testes determinísticos e
 * (b) como gabarito no teste contra a API real (`pnpm test:llm`).
 */
export const MENSAGENS: { texto: string; esperado: IntencaoParcial }[] = [
  {
    texto: 'emprestei 2000 pro Carlos, volta 2400 dia 15/12',
    esperado: {
      tipo: 'criar_operacao',
      dados: {
        cliente: 'Carlos Souza',
        documento: null,
        valor_emprestado: 2000,
        valor_total_receber: 2400,
        numero_parcelas: null,
        periodicidade: null,
        primeiro_vencimento: '2026-12-15',
        data_emprestimo: null,
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
        documento: null,
        valor_emprestado: 500,
        valor_total_receber: 600,
        numero_parcelas: 4,
        periodicidade: 'semanal',
        primeiro_vencimento: '2026-10-23',
        data_emprestimo: null,
        observacoes: null,
      },
    },
  },
  {
    texto: 'Carlos pagou 1200',
    esperado: { tipo: 'registrar_pagamento', dados: { cliente: 'Carlos Souza', valor: 1200, data: null, forma: null } },
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

/** Mensagens incompletas: o modelo extrai o que há e deixa o resto null (o bot pergunta). */
export const PARCIAIS: { texto: string; esperado: IntencaoParcial }[] = [
  {
    texto: '1000 para receber dia 20/11/2026',
    esperado: {
      tipo: 'criar_operacao',
      dados: {
        cliente: null,
        documento: null,
        valor_emprestado: null,
        valor_total_receber: 1000,
        numero_parcelas: null,
        periodicidade: null,
        primeiro_vencimento: '2026-11-20',
        data_emprestimo: null,
        observacoes: null,
      },
    },
  },
  {
    texto: 'cadastro',
    esperado: { tipo: 'criar_cliente', dados: { nome: null, apelidos: [], telefone: null, documento: null } },
  },
  {
    texto: 'emprestei 1500 pro Marcos',
    esperado: {
      tipo: 'criar_operacao',
      dados: {
        cliente: 'Marcos Silva',
        documento: null,
        valor_emprestado: 1500,
        valor_total_receber: null,
        numero_parcelas: null,
        periodicidade: null,
        primeiro_vencimento: null,
        data_emprestimo: null,
        observacoes: null,
      },
    },
  },
];

/** Buscas de clientes que passam pela IA (as frases curtas vão por atalho). */
export const BUSCAS: { texto: string; esperado: IntencaoParcial }[] = [
  { texto: 'clientes com Silva', esperado: { tipo: 'consultar', dados: { tipo: 'listar_clientes', cliente: 'Silva', data_inicio: null, data_fim: null } } },
  { texto: 'qual o CPF do Marcos?', esperado: { tipo: 'consultar', dados: { tipo: 'listar_clientes', cliente: 'Marcos Silva', data_inicio: null, data_fim: null } } },
];

export const SO_JUROS: { texto: string; esperado: IntencaoParcial }[] = [
  { texto: 'o Carlos pagou só os juros', esperado: { tipo: 'registrar_pagamento', dados: { cliente: 'Carlos Souza', valor: null, data: null, forma: null, so_juros: true } } },
];
