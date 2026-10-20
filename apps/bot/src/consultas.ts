import {
  aReceberNoPeriodo,
  formatarDocumento,
  normalizarNome,
  calcularKpis,
  inicioSemana,
  listarAtrasados,
  metricasCliente,
  resumoDiario,
  saldoParcela,
  somarDias,
  somarMeses,
  type DataISO,
  type Periodo,
} from '@cobra/core';
import type { CarteiraCompleta } from '@cobra/db';
import { escapar, type Botao, type Formatador } from './formatacao';

function nomeCliente(c: CarteiraCompleta, operacaoId: string): string {
  const op = c.operacoes.find((o) => o.id === operacaoId);
  return escapar((op && c.clientes.get(op.cliente_id)?.nome) ?? '?');
}

function rotuloParcela(c: CarteiraCompleta, operacaoId: string, numero: number): string {
  const total = c.parcelas.filter((p) => p.operacao_id === operacaoId).length;
  return total > 1 ? ` (${numero}/${total})` : '';
}

export function textoAReceber(c: CarteiraCompleta, periodo: Periodo, hoje: DataISO, f: Formatador): string {
  const ano = hoje.slice(0, 4);
  const ps = aReceberNoPeriodo(c.carteira, periodo);
  const total = ps.reduce((a, p) => a + saldoParcela(p).total, 0);
  const pessoas = new Set(ps.map((p) => nomeCliente(c, p.operacaoId))).size;
  const titulo =
    periodo.inicio === periodo.fim
      ? `📅 <b>A receber em ${f.data(periodo.inicio, ano)}</b>`
      : `📅 <b>A receber de ${f.data(periodo.inicio, ano)} a ${f.data(periodo.fim, ano)}</b>`;
  if (ps.length === 0) return `${titulo}\nNada previsto. 🎉`;
  const linhas = ps.map(
    (p) =>
      `• ${f.data(p.vencimento, ano)} — ${nomeCliente(c, p.operacaoId)}${rotuloParcela(c, p.operacaoId, p.numero)}: ${f.dinheiro(saldoParcela(p).total)}`,
  );
  const vencido = listarAtrasados(c.carteira, hoje).reduce((a, x) => a + x.saldo, 0);
  return [
    titulo,
    `Total: <b>${f.dinheiro(total)}</b> · ${ps.length} parcela(s) · ${pessoas} pessoa(s)`,
    ...linhas,
    ...(vencido > 0 && periodo.inicio <= hoje ? [`\n🔴 Além disso, ${f.dinheiro(vencido)} já vencido (/atrasados)`] : []),
  ].join('\n');
}

export function textoAtrasados(c: CarteiraCompleta, hoje: DataISO, f: Formatador, limite = 20): string {
  const lista = listarAtrasados(c.carteira, hoje);
  if (lista.length === 0) return '✅ Ninguém atrasado.';
  const total = lista.reduce((a, x) => a + x.saldo, 0);
  const ano = hoje.slice(0, 4);
  return [
    `🔴 <b>Atrasados</b> — ${f.dinheiro(total)}`,
    ...lista.slice(0, limite).map((x) => {
      const p = c.parcelas.find((y) => y.id === x.parcelaId)!;
      return `• ${nomeCliente(c, x.operacaoId)}${rotuloParcela(c, x.operacaoId, p.numero)}: ${f.dinheiro(x.saldo)} — ${x.diasAtraso} dia(s) (venc. ${f.data(x.vencimento, ano)})`;
    }),
    ...(lista.length > limite ? [`… e mais ${lista.length - limite}`] : []),
  ].join('\n');
}

export function textoCliente(c: CarteiraCompleta, clienteId: string, hoje: DataISO, f: Formatador): string {
  const cli = c.clientes.get(clienteId);
  const m = metricasCliente(c.carteira, clienteId, hoje);
  const ano = hoje.slice(0, 4);
  const abertas = c.carteira.parcelas
    .filter((p) => {
      const op = c.carteira.operacoes.find((o) => o.id === p.operacaoId);
      return op?.clienteId === clienteId && ['ativa', 'atrasada', 'renegociada'].includes(op.status) && saldoParcela(p).total > 0;
    })
    .sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1));
  const linhas = [
    `👤 <b>${escapar(cli?.nome ?? '?')}</b>`,
    `🪪 ${documentoRotulado(cli?.documento_tipo ?? null, cli?.documento ?? null)}`,
    `Saldo em aberto: <b>${f.dinheiro(m.saldoAtual)}</b>`,
    `Total emprestado: ${f.dinheiro(m.totalEmprestado)} · recebido: ${f.dinheiro(m.totalRecebido)}`,
    `Operações: ${m.operacoes} (${m.operacoesEmAberto} em aberto) · renegociações: ${m.renegociacoes}`,
    `Pontualidade: ${m.percentualPagoEmDia === null ? '—' : f.pct(m.percentualPagoEmDia)} · atraso médio: ${m.atrasoMedioDias === null ? '—' : `${m.atrasoMedioDias.toFixed(1)} dias`}`,
  ];
  if (abertas.length) {
    linhas.push('', '<b>Parcelas em aberto</b>');
    for (const p of abertas) {
      const icone = p.vencimento < hoje ? '🔴' : p.vencimento <= somarDias(hoje, 3) ? '🟠' : '•';
      linhas.push(`${icone} ${f.data(p.vencimento, ano)}${rotuloParcela(c, p.operacaoId, p.numero)}: ${f.dinheiro(saldoParcela(p).total)}`);
    }
  }
  return linhas.join('\n');
}

const ROTULO_DOCUMENTO: Record<string, string> = { cpf: 'CPF', cnpj: 'CNPJ', rg: 'RG', outro: 'Doc.' };

/** "CPF 529.982.247-25", "CNPJ 11.222.333/0001-81", "RG 123456789". */
export function documentoRotulado(tipo: string | null, numero: string | null): string {
  if (!tipo || !numero) return 'sem documento';
  const rotulo = ROTULO_DOCUMENTO[tipo] ?? 'Doc.';
  return `${rotulo} <code>${formatarDocumento(tipo, numero).replace(/^RG /, '')}</code>`;
}

function textoContratos(total: number, emAberto: number): string {
  if (total === 0) return 'nenhum contrato';
  const base = `${total} contrato${total > 1 ? 's' : ''}`;
  return emAberto ? `${base} · ${emAberto} em aberto` : `${base} · todos quitados`;
}

/** Botões da lista: um por cliente (2 por linha), abrindo a ficha direto. */
export function botoesClientes(c: CarteiraCompleta, filtro: string | null, limite = 20): Botao[][] {
  const lista = filtrarClientes(c, filtro).slice(0, limite);
  const linhas: Botao[][] = [];
  for (let i = 0; i < lista.length; i += 2) {
    linhas.push(lista.slice(i, i + 2).map((cl, j) => ({ texto: `${i + j + 1}. ${cl.nome}`, dados: `fc:${cl.id}` })));
  }
  return linhas;
}

/**
 * Pesquisa de clientes. Com número, procura no documento; com letras, no nome e nos apelidos.
 * Termo curto (1–2 caracteres) é "começa com" ("P" → todos que começam com P); a partir de 3, "contém".
 */
export function filtrarClientes(c: CarteiraCompleta, filtro: string | null) {
  const ativos = [...c.clientes.values()].filter((cl) => cl.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const termo = filtro?.trim() ?? '';
  if (!termo) return ativos;
  const casa = (alvo: string, t: string) => (t.length < 3 ? alvo.startsWith(t) : alvo.includes(t));
  if (/\d/.test(termo)) {
    const digitos = termo.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return ativos.filter((cl) => !!cl.documento && casa(cl.documento, digitos));
  }
  const t = normalizarNome(termo);
  return ativos.filter((cl) => [cl.nome, ...cl.apelidos].some((n) => casa(normalizarNome(n), t)));
}

/** Lista enxuta de clientes: nome completo, documento e nº de contratos. Filtro por nome, apelido ou documento. */
export function textoClientes(c: CarteiraCompleta, filtro: string | null, hoje: DataISO, limite = 40): string {
  const lista = filtrarClientes(c, filtro);
  if (lista.length === 0) {
    return filtro ? `🔎 Nenhum cliente encontrado para <b>${escapar(filtro)}</b>.\nTente de novo: /pesquisa` : 'Nenhum cliente cadastrado ainda.';
  }
  const blocos = lista.slice(0, limite).map((cl, i) => {
    const m = metricasCliente(c.carteira, cl.id, hoje);
    return [
      `<b>${i + 1}. ${escapar(cl.nome)}</b>`,
      `    🪪 ${documentoRotulado(cl.documento_tipo, cl.documento)}`,
      `    📄 ${textoContratos(m.operacoes, m.operacoesEmAberto)}`,
    ].join('\n');
  });
  return [
    filtro ? `🔎 <b>Pesquisa "${escapar(filtro)}"</b> · ${lista.length} cliente${lista.length > 1 ? 's' : ''}` : `👥 <b>Clientes</b> · ${lista.length}`,
    '',
    blocos.join('\n\n'),
    ...(lista.length > limite ? ['', `… e mais ${lista.length - limite}. Refine em /pesquisa`] : []),
    '',
    'Toque no documento para copiar, ou no botão para abrir a ficha.',
  ].join('\n');
}

export function textoResumoCarteira(c: CarteiraCompleta, hoje: DataISO, f: Formatador): string {
  const inicio = `${hoje.slice(0, 8)}01`;
  const periodo = { inicio, fim: somarDias(somarMeses(inicio, 1), -1) };
  const k = calcularKpis(c.carteira, hoje, periodo);
  return [
    '📊 <b>Carteira</b>',
    `Capital na rua: <b>${f.dinheiro(k.capitalNaRua)}</b>`,
    `Total a receber: <b>${f.dinheiro(k.totalAReceber)}</b>`,
    `Próximos 7 dias: ${f.dinheiro(k.aReceber7Dias)}`,
    `Vencido: ${k.totalVencido > 0 ? '🔴 ' : ''}${f.dinheiro(k.totalVencido)}`,
    '',
    '<b>Este mês</b>',
    `Lucro realizado: ${f.dinheiro(k.lucroRealizado)} · a realizar: ${f.dinheiro(k.lucroARealizar)}`,
    ...(k.prejuizo > 0 ? [`Prejuízo: ${f.dinheiro(k.prejuizo)}`] : []),
  ].join('\n');
}

/** Resumo diário: total de hoje, nº de pessoas, total vencido e top 3 atrasados. */
export function textoResumoDiario(c: CarteiraCompleta, hoje: DataISO, f: Formatador): string {
  const r = resumoDiario(c.carteira, hoje);
  const linhas = [
    `☀️ <b>Resumo de ${f.data(hoje)}</b>`,
    `Hoje: <b>${f.dinheiro(r.aReceberHoje)}</b> de ${r.pessoasHoje} pessoa(s)`,
    `Vencido: ${r.totalVencido > 0 ? '🔴 ' : ''}${f.dinheiro(r.totalVencido)}`,
  ];
  if (r.topAtrasados.length) {
    linhas.push('', '<b>Maiores atrasos</b>');
    for (const x of r.topAtrasados) {
      linhas.push(`• ${nomeCliente(c, x.operacaoId)}: ${f.dinheiro(x.saldo)} — ${x.diasAtraso} dia(s)`);
    }
  }
  return linhas.join('\n');
}

export function textoResumoSemanal(c: CarteiraCompleta, hoje: DataISO, f: Formatador): string {
  const seg = inicioSemana(hoje);
  return [
    '🗓️ <b>Resumo da semana</b>',
    textoAReceber(c, { inicio: seg, fim: somarDias(seg, 6) }, hoje, f),
    '',
    textoResumoCarteira(c, hoje, f),
  ].join('\n');
}
