import { parseDataCurta, parseDocumento, parseValor, type DataISO } from '@cobra/core';
import { escapar } from './formatacao';
import type { Intencao, IntencaoParcial } from './ia/ferramentas';

/**
 * Rascunho de lançamento: a intenção vai sendo completada ao longo da conversa.
 * O bot pergunta UM campo por vez, na ordem abaixo, até ter o necessário para o resumo.
 */

export type TipoRascunho = 'criar_operacao' | 'registrar_pagamento' | 'prorrogar' | 'criar_cliente';
export type Rascunho = Extract<IntencaoParcial, { tipo: TipoRascunho }>;

export type Campo =
  | 'cliente'
  | 'valor_emprestado'
  | 'valor_total_receber'
  | 'primeiro_vencimento'
  | 'valor'
  | 'alteracao'
  | 'nome'
  | 'documento';

export function ehRascunho(i: IntencaoParcial): i is Rascunho {
  return i.tipo === 'criar_operacao' || i.tipo === 'registrar_pagamento' || i.tipo === 'prorrogar' || i.tipo === 'criar_cliente';
}

/** Primeiro campo obrigatório que ainda falta (null = completo). */
export function campoFaltante(r: Rascunho): Campo | null {
  switch (r.tipo) {
    case 'criar_operacao': {
      const d = r.dados;
      if (!d.cliente) return 'cliente';
      if (d.valor_emprestado == null) return 'valor_emprestado';
      if (d.valor_total_receber == null) return 'valor_total_receber';
      if (!d.primeiro_vencimento) return 'primeiro_vencimento';
      return null;
    }
    case 'registrar_pagamento':
      if (!r.dados.cliente) return 'cliente';
      if (r.dados.valor == null) return 'valor';
      return null;
    case 'prorrogar':
      if (!r.dados.cliente) return 'cliente';
      if (!r.dados.novo_vencimento && r.dados.acrescimo == null) return 'alteracao';
      return null;
    case 'criar_cliente':
      if (!r.dados.nome) return 'nome';
      // O documento é pedido (e validado) pelo fluxo de cadastro.
      return null;
  }
}

/**
 * Erros de consistência que exigem perguntar de novo (ex.: total menor que o emprestado).
 * O campo descartado é o que acabou de ser respondido (`recente`), que é o suspeito de erro.
 */
export function problema(r: Rascunho, hoje: DataISO, recente: Campo | null = null): { campo: Campo; mensagem: string } | null {
  if (r.tipo !== 'criar_operacao') return null;
  const d = r.dados;
  if (d.valor_emprestado != null && d.valor_total_receber != null && d.valor_total_receber < d.valor_emprestado) {
    return {
      campo: recente === 'valor_emprestado' ? 'valor_emprestado' : 'valor_total_receber',
      mensagem: 'O total a receber não pode ser menor que o valor emprestado.',
    };
  }
  const base = d.data_emprestimo ?? hoje;
  if (d.primeiro_vencimento && d.primeiro_vencimento <= base) {
    return { campo: 'primeiro_vencimento', mensagem: 'O vencimento precisa ser depois da data do empréstimo.' };
  }
  return null;
}

export function pergunta(campo: Campo, r: Rascunho): string {
  switch (campo) {
    case 'cliente':
      return r.tipo === 'criar_operacao' ? '👤 Para quem é o empréstimo?' : r.tipo === 'registrar_pagamento' ? '👤 Quem pagou?' : '👤 De qual cliente?';
    case 'valor_emprestado':
      return '💸 Quanto você emprestou?';
    case 'valor_total_receber':
      return '💰 Quanto vai receber de volta no total? (com isso eu calculo os juros)';
    case 'primeiro_vencimento':
      return '📅 Quando vence? Ex.: <code>20/11</code>, <code>dia 30</code>, <code>daqui 30 dias</code> ou <code>4x mensais a partir de 20/11</code>.';
    case 'valor':
      return '💰 Qual valor foi pago?';
    case 'alteracao':
      return '📅 Para quando adiar e/ou quanto acrescentar? Ex.: <code>dia 30</code>, <code>dia 30 com mais 100</code>.';
    case 'nome':
      return '👤 Qual o nome completo do cliente?';
    case 'documento':
      return '🪪 Qual o documento do cliente?';
  }
}

/**
 * Tenta responder o campo pedido sem IA, quando a mensagem é só o dado ("1200", "20/11").
 * Retorna o rascunho atualizado, ou null para cair na IA.
 */
export function preencherDireto(r: Rascunho, campo: Campo, texto: string, hoje: DataISO): Rascunho | null {
  const t = texto.trim();
  const soValor = /^(r\$\s*)?[\d.,]+$/i.test(t) ? parseValor(t) : null;
  const reais = soValor && soValor > 0 ? soValor / 100 : null;
  switch (campo) {
    case 'valor_emprestado':
    case 'valor_total_receber':
      return reais && r.tipo === 'criar_operacao' ? { ...r, dados: { ...r.dados, [campo]: reais } } : null;
    case 'valor':
      return reais && r.tipo === 'registrar_pagamento' ? { ...r, dados: { ...r.dados, valor: reais } } : null;
    case 'primeiro_vencimento': {
      const d = /^(dia\s+)?[\d/\-]+$/i.test(t) ? parseDataCurta(t, hoje) : null;
      return d && r.tipo === 'criar_operacao' ? { ...r, dados: { ...r.dados, primeiro_vencimento: d } } : null;
    }
    case 'nome':
      // Nome puro (sem números): "Pedro Miquiles". Com números pode ser nome + documento → IA.
      return r.tipo === 'criar_cliente' && /^[\p{L}][\p{L}\s.'-]{1,80}$/u.test(t) ? { ...r, dados: { ...r.dados, nome: t } } : null;
    case 'cliente':
      return /^[\p{L}][\p{L}\s.'-]{1,80}$/u.test(t) && r.tipo !== 'criar_cliente' ? ({ ...r, dados: { ...r.dados, cliente: t } } as Rascunho) : null;
    case 'documento':
      return r.tipo === 'criar_cliente' && !('erro' in parseDocumento(t)) ? { ...r, dados: { ...r.dados, documento: t } } : null;
    default:
      return null;
  }
}

/** Junta o que a nova mensagem trouxe ao rascunho: só campos preenchidos sobrescrevem. */
export function mesclar(base: Rascunho, nova: Rascunho): Rascunho {
  if (base.tipo !== nova.tipo) return nova;
  const dados: Record<string, unknown> = { ...base.dados };
  for (const [k, v] of Object.entries(nova.dados)) {
    if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) dados[k] = v;
  }
  return { tipo: base.tipo, dados } as Rascunho;
}

/** Rascunho completo → intenção pronta, com padrões (parcela única mensal, empréstimo hoje). */
export function completar(r: Rascunho, hoje: DataISO): Intencao | null {
  if (campoFaltante(r)) return null;
  switch (r.tipo) {
    case 'criar_operacao': {
      const d = r.dados;
      return {
        tipo: 'criar_operacao',
        dados: {
          ...d,
          cliente: d.cliente!,
          valor_emprestado: d.valor_emprestado!,
          valor_total_receber: d.valor_total_receber!,
          primeiro_vencimento: d.primeiro_vencimento!,
          numero_parcelas: d.numero_parcelas ?? 1,
          periodicidade: d.periodicidade ?? 'mensal',
          data_emprestimo: d.data_emprestimo ?? hoje,
        },
      };
    }
    case 'registrar_pagamento':
      return { tipo: 'registrar_pagamento', dados: { ...r.dados, cliente: r.dados.cliente!, valor: r.dados.valor!, data: r.dados.data ?? hoje } };
    case 'prorrogar':
      return { tipo: 'prorrogar', dados: { ...r.dados, cliente: r.dados.cliente! } };
    case 'criar_cliente':
      return { tipo: 'criar_cliente', dados: r.dados };
  }
}

/** Texto curto do que já se sabe, para mostrar junto da próxima pergunta. */
export function resumoParcial(r: Rascunho, fmtReais: (v: number) => string, fmtData: (d: DataISO) => string): string {
  const partes: string[] = [];
  const d = r.dados as Record<string, unknown>;
  if (r.tipo === 'criar_operacao') {
    if (d.cliente) partes.push(`para <b>${escapar(String(d.cliente))}</b>`);
    if (d.valor_emprestado != null) partes.push(`emprestado ${fmtReais(d.valor_emprestado as number)}`);
    if (d.valor_total_receber != null) partes.push(`recebe ${fmtReais(d.valor_total_receber as number)}`);
    if (d.primeiro_vencimento) partes.push(`vence ${fmtData(d.primeiro_vencimento as string)}`);
    if (d.numero_parcelas && (d.numero_parcelas as number) > 1) partes.push(`${String(d.numero_parcelas)}x ${String(d.periodicidade ?? '')}`);
    return partes.length ? `📝 Novo empréstimo: ${partes.join(' · ')}` : '📝 Novo empréstimo';
  }
  if (r.tipo === 'registrar_pagamento') {
    if (d.cliente) partes.push(`de <b>${escapar(String(d.cliente))}</b>`);
    if (d.valor != null) partes.push(fmtReais(d.valor as number));
    return `💰 Pagamento${partes.length ? `: ${partes.join(' · ')}` : ''}`;
  }
  if (r.tipo === 'criar_cliente') return '👤 Novo cliente';
  return '📅 Prorrogação';
}
