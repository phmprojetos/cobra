import {
  avaliarNotificacoes,
  dataLocal,
  diferencaDias,
  operacaoEmAberto,
  saldoParcela,
  type Alerta,
  type ParcelaParaAlerta,
} from '@cobra/core';
import { atualizarStatus, paraRegra, type CarteiraCompleta, type Repositorio } from '@cobra/db';
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

/**
 * Job a cada 15 min: atualiza status (atrasos) e envia os alertas devidos.
 * Idempotência: a linha em `notificacoes_enviadas` é reservada ANTES do envio
 * (unique por regra/parcela/data); se o envio falhar, a reserva é liberada para nova tentativa.
 */
export async function executarJobNotificacoes(
  repo: Repositorio,
  enviar: Enviar,
  destinatarios: readonly number[],
  log: Log,
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
  let enviados = 0;
  let falhas = 0;
  for (const alerta of alertas) {
    const resposta: Resposta | null =
      alerta.tipo === 'parcela'
        ? (() => {
            const texto = textoAlertaParcela(alerta, carteira, hoje, f);
            return texto ? { texto, teclado: botoesAlertaParcela(alerta.parcelaId) } : null;
          })()
        : {
            texto:
              alerta.tipo === 'resumo_diario'
                ? textoResumoDiario(carteira, alerta.dataReferencia, f)
                : textoResumoSemanal(carteira, alerta.dataReferencia, f),
          };
    if (!resposta) continue;

    const reserva = await repo.reservarNotificacao(alerta.regra.id, alerta.parcelaId, alerta.dataReferencia);
    if (!reserva) continue; // outro processo já enviou
    try {
      let messageId = 0;
      for (const chat of destinatarios) messageId = await enviar(chat, resposta);
      await repo.confirmarNotificacao(reserva, messageId);
      enviados++;
    } catch (err) {
      falhas++;
      log.error({ err, alerta: { regra: alerta.regra.id, parcela: alerta.parcelaId } }, 'falha ao enviar alerta');
      await repo.liberarNotificacao(reserva);
    }
  }
  if (enviados || falhas || statusAtualizados) log.info({ statusAtualizados, enviados, falhas }, 'job de notificações');
  return { statusAtualizados, enviados, falhas };
}
