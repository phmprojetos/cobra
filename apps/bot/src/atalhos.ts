import { normalizarNome, parseDataCurta, parseValor, type DataISO } from '@cobra/core';
import type { Intencao, IntencaoParcial } from './ia/ferramentas';

/**
 * Parsers determinísticos dos comandos de atalho (funcionam sem IA).
 * Devolvem a mesma `Intencao` que o LLM produziria, para seguir o mesmo fluxo de confirmação.
 */

const PERIODICIDADES = ['semanal', 'quinzenal', 'mensal'] as const;

function separarNome(tokens: string[]): { nome: string; resto: string[] } {
  const i = tokens.findIndex((t) => /^(R\$)?[\d.,]*\d[\d.,]*$/i.test(t) && parseValor(t) !== null);
  if (i <= 0) return { nome: '', resto: [] };
  return { nome: tokens.slice(0, i).join(' '), resto: tokens.slice(i) };
}

/** `/novo Carlos 2000 2400 15/12 [4x] [semanal]` */
export function parseNovo(args: string, hoje: DataISO): Intencao | { erro: string } {
  const { nome, resto } = separarNome(args.trim().split(/\s+/).filter(Boolean));
  const [vEmp, vTot, venc, ...extras] = resto;
  const emprestado = vEmp ? parseValor(vEmp) : null;
  const total = vTot ? parseValor(vTot) : null;
  const vencimento = venc ? parseDataCurta(venc, hoje) : null;
  if (!nome || !emprestado || !total || !vencimento) {
    return { erro: 'Uso: /novo <code>nome valor total vencimento [4x] [semanal|quinzenal|mensal]</code>\nEx.: /novo Carlos 2000 2400 15/12' };
  }
  let numero = 1;
  let periodicidade: (typeof PERIODICIDADES)[number] = 'mensal';
  for (const e of extras) {
    const m = /^(\d{1,3})x$/i.exec(e);
    if (m) numero = Number(m[1]);
    else if ((PERIODICIDADES as readonly string[]).includes(e.toLowerCase())) {
      periodicidade = e.toLowerCase() as (typeof PERIODICIDADES)[number];
    } else return { erro: `Não entendi "${e}". Use por ex. <code>4x semanal</code>.` };
  }
  return {
    tipo: 'criar_operacao',
    dados: {
      cliente: nome,
      documento: null,
      valor_emprestado: emprestado / 100,
      valor_total_receber: total / 100,
      numero_parcelas: numero,
      periodicidade,
      primeiro_vencimento: vencimento,
      data_emprestimo: hoje,
      observacoes: null,
    },
  };
}

/** `/pagar Carlos 1200 [15/10]` */
export function parsePagar(args: string, hoje: DataISO): Intencao | { erro: string } {
  const { nome, resto } = separarNome(args.trim().split(/\s+/).filter(Boolean));
  const [v, d] = resto;
  const valor = v ? parseValor(v) : null;
  const data = d ? parseDataCurta(d, hoje, 'passado') : hoje;
  if (!nome || !valor || valor <= 0 || !data) {
    return { erro: 'Uso: /pagar <code>nome valor [data]</code>\nEx.: /pagar Carlos 1200' };
  }
  return { tipo: 'registrar_pagamento', dados: { cliente: nome, valor: valor / 100, data, forma: null } };
}

const VAZIO_OPERACAO = {
  cliente: null,
  documento: null,
  valor_emprestado: null,
  valor_total_receber: null,
  numero_parcelas: null,
  periodicidade: null,
  primeiro_vencimento: null,
  data_emprestimo: null,
  observacoes: null,
} as const;

/**
 * Palavras-chave curtas que abrem um rascunho sem IA ("cadastro", "novo empréstimo", "pagamento").
 * Mais rápido, sem custo e sem o modelo confundir com saudação.
 */
export function intencaoRapida(texto: string): IntencaoParcial | null {
  const t = normalizarNome(texto).replace(/[!.?]+$/, '');
  if (/^(cadastro|cadastrar|cadastrar cliente|novo cliente|cadastro de cliente|cadastrar um cliente)$/.test(t)) {
    return { tipo: 'criar_cliente', dados: { nome: null, apelidos: [], telefone: null, documento: null } };
  }
  if (/^(emprestimo|novo emprestimo|emprestar|lancar emprestimo|registrar emprestimo)$/.test(t)) {
    return { tipo: 'criar_operacao', dados: { ...VAZIO_OPERACAO } };
  }
  if (/^((liste|listar|lista|mostre|mostrar|ver)( os| de| meus)? clientes|clientes|meus clientes|lista de clientes)$/.test(t)) {
    return { tipo: 'consultar', dados: { tipo: 'listar_clientes', cliente: null, data_inicio: null, data_fim: null } };
  }
  if (/^(editar|editar cliente|corrigir cliente|alterar cliente)$/.test(t)) {
    return { tipo: 'editar_cliente', dados: { cliente: '', campo: 'indefinido', valor: null } };
  }
  if (/^(pagamento|registrar pagamento|recebi|recebimento|baixa)$/.test(t)) {
    return { tipo: 'registrar_pagamento', dados: { cliente: null, valor: null, data: null, forma: null } };
  }
  return null;
}
