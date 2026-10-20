import {
  avaliarNotificacoes,
  dataLocal,
  horaLocal,
  diferencaDias,
  operacaoEmAberto,
  saldoParcela,
  type Alerta,
  type ParcelaParaAlerta,
} from '@cobra/core';
import { atualizarStatus, paraRegra, type CarteiraCompleta, type Repositorio } from '@cobra/db';
import { mensagemDevedoresDoDia, mensagemGrupoParcelas, mensagemVencemAmanha, type TipoGrupo } from './canal';
import { textoResumoDiario, textoResumoSemanal } from './consultas';
import { escapar, Formatador, type Botao, type Resposta } from './formatacao';
import type { Log } from './aplicacao';

/** Envia uma mensagem e devolve o message_id do Telegram. */
export type Enviar = (chatId: number, r: Resposta) => Promise<number>;

export function botoesAlertaParcela(parcelaId: string): Botao[][] {
  return [
    [
      { texto: '💰 Recebido total', dados: `rt:${parcelaId}` },
      { texto: '🪙 Recebido parcial', dados: `rp:${parcelaId}` },
    ],
    [{ texto: '🔁 Pagou só os juros (renova)', dados: `rj:${parcelaId}` }],
    [
      { texto: '📅 +1', dados: `ad:${parcelaId}:1` },
      { texto: '+3', dados: `ad:${parcelaId}:3` },
      { texto: '+7', dados: `ad:${parcelaId}:7` },
      { texto: 'Outra data', dados: `al:${parcelaId}` },
    ],
  ];
}

export function textoAlertaParcela(
  alerta: Extract<Alerta, { tipo: 'parcela' }>,
  c: CarteiraCompleta,
  hoje: string,
  f: Formatador,
): string | null {
  const p = c.parcelas.find((x) => x.id === alerta.parcelaId);
  const op = p && c.operacoes.find((o) => o.id === p.operacao_id);
  if (!p || !op) return null;
  const nome = escapar(c.clientes.get(op.cliente_id)?.nome ?? '?');
  const total = c.parcelas.filter((x) => x.operacao_id === op.id).length;
  const rotulo = total > 1 ? ` · parcela ${p.numero}/${total}` : '';
  const saldo = f.dinheiro(saldoParcela({
    valor: p.valor, valorPrincipal: p.valor_principal, valorJuros: p.valor_juros,
    valorPago: p.valor_pago, principalPago: p.principal_pago, jurosPago: p.juros_pago, status: p.status,
  }).total);
  const ano = hoje.slice(0, 4);
  switch (alerta.regra.tipo) {
    case 'lembrete_antes': {
      const dias = diferencaDias(hoje, p.vencimento);
      const quando = dias === 1 ? 'amanhã' : dias === 0 ? 'hoje' : `em ${dias} dias`;
      return `🟠 <b>${nome}</b> vence ${quando} (${f.data(p.vencimento, ano)})${rotulo}\nValor: <b>${saldo}</b>`;
    }
    case 'no_dia':
      return `🟠 <b>Vence hoje:</b> ${nome}${rotulo}\nValor: <b>${saldo}</b>`;
    case 'atraso': {
      const dias = Math.max(1, diferencaDias(p.vencimento, hoje));
      return `🔴 <b>${nome}</b> está ${dias} dia(s) atrasado${rotulo}\nVenceu ${f.data(p.vencimento, ano)} · em aberto: <b>${saldo}</b>`;
    }
    default:
      return null;
  }
}

export interface ResultadoJob {
  statusAtualizados: number;
  enviados: number;
  falhas: number;
}

/** Uma mensagem a enviar e as chaves de idempotência (regra/parcela/data) que ela cobre. */
interface Envio {
  resposta: Resposta;
  chaves: { regraId: string; parcelaId: string | null; data: string }[];
}

/**
 * Job a cada 15 min: atualiza status (atrasos) e envia os alertas devidos.
 * - Com canal de alertas configurado: mensagens agrupadas (uma por regra/dia) no canal.
 * - Sem canal: um alerta por parcela, com botões de ação, no chat privado de cada usuário.
 * Idempotência: as linhas em `notificacoes_enviadas` são reservadas ANTES do envio
 * (unique por regra/parcela/data); se o envio falhar, as reservas são liberadas.
 */
export async function executarJobNotificacoes(
  repo: Repositorio,
  enviar: Enviar,
  destinatarios: readonly number[],
  log: Log,
  botUsername = '',
): Promise<ResultadoJob> {
  const statusAtualizados = await atualizarStatus(repo);
  const config = await repo.configuracao();
  const agora = repo.relogio();
  const hoje = dataLocal(agora, config.timezone);
  const [regras, carteira, enviadas] = await Promise.all([
    repo.regras(),
    repo.carregarCarteira(),
    repo.chavesEnviadas(await repo.desdeParaNotificacoes()),
  ]);

  const abertas = new Set(carteira.operacoes.filter((o) => operacaoEmAberto(o.status)).map((o) => o.id));
  const parcelas: ParcelaParaAlerta[] = carteira.carteira.parcelas
    .filter((p) => abertas.has(p.operacaoId))
    .map((p) => ({
      id: p.id,
      clienteId: carteira.operacoes.find((o) => o.id === p.operacaoId)!.cliente_id,
      vencimento: p.vencimento,
      saldo: saldoParcela(p).total,
    }));

  const alertas = avaliarNotificacoes({
    agora,
    timezone: config.timezone,
    silencio: config.silencio,
    regras: regras.map(paraRegra),
    parcelas,
    enviadas,
  });

  const f = new Formatador(config);
  const canal = config.canalAlertas;
  const envios: Envio[] = [];
  const chave = (a: Alerta) => ({ regraId: a.regra.id, parcelaId: a.parcelaId, data: a.dataReferencia });

  // Mensagens da carteira (não ligadas a parcela)
  for (const a of alertas) {
    if (a.tipo === 'parcela') continue;
    const resposta =
      a.tipo === 'resumo_diario'
        ? { texto: textoResumoDiario(carteira, a.dataReferencia, f) }
        : a.tipo === 'resumo_semanal'
          ? { texto: textoResumoSemanal(carteira, a.dataReferencia, f) }
          : a.tipo === 'lista_amanha'
            ? mensagemVencemAmanha(carteira, a.dataReferencia, horaLocal(agora, config.timezone), f, botUsername)
            : // Devedores do dia: status do momento do envio; sem devedores, diz isso.
              mensagemDevedoresDoDia(carteira, a.dataReferencia, horaLocal(agora, config.timezone), f, botUsername);
    envios.push({ resposta, chaves: [chave(a)] });
  }

  const deParcela = alertas.filter((a): a is Extract<Alerta, { tipo: 'parcela' }> => a.tipo === 'parcela');
  if (canal) {
    // Agrupa por regra + dia: "vencem amanhã: A, B, C" numa mensagem só.
    const grupos = new Map<string, Extract<Alerta, { tipo: 'parcela' }>[]>();
    for (const a of deParcela) {
      const k = `${a.regra.id}|${a.dataReferencia}`;
      grupos.set(k, [...(grupos.get(k) ?? []), a]);
    }
    for (const lista of grupos.values()) {
      const tipo = lista[0]!.regra.tipo as TipoGrupo;
      const msg = mensagemGrupoParcelas(tipo, lista.map((a) => a.parcelaId), carteira, hoje, f, botUsername);
      envios.push({ resposta: msg ?? { texto: '' }, chaves: lista.map(chave) });
    }
  } else {
    for (const a of deParcela) {
      const texto = textoAlertaParcela(a, carteira, hoje, f);
      envios.push({ resposta: texto ? { texto, teclado: botoesAlertaParcela(a.parcelaId) } : { texto: '' }, chaves: [chave(a)] });
    }
  }

  const destinos = canal ? [canal.id] : destinatarios;
  let enviados = 0;
  let falhas = 0;
  for (const envio of envios) {
    const reservas: string[] = [];
    for (const k of envio.chaves) {
      const id = await repo.reservarNotificacao(k.regraId, k.parcelaId, k.data);
      if (id) reservas.push(id);
    }
    if (reservas.length === 0) continue; // outro processo já cuidou
    if (!envio.resposta.texto) continue; // nada a dizer (ex.: nenhum atrasado): fica só a marca
    try {
      let messageId = 0;
      for (const chat of destinos) messageId = await enviar(chat, envio.resposta);
      for (const id of reservas) await repo.confirmarNotificacao(id, messageId);
      enviados++;
    } catch (err) {
      falhas++;
      log.error({ err, chaves: envio.chaves }, 'falha ao enviar alerta');
      for (const id of reservas) await repo.liberarNotificacao(id);
    }
  }
  if (enviados || falhas || statusAtualizados) log.info({ carteira: repo.carteiraId, statusAtualizados, enviados, falhas, destino: canal ? 'canal' : 'privado' }, 'job de notificações');
  return { statusAtualizados, enviados, falhas };
}
