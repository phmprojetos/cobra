import { Bot, GrammyError, InlineKeyboard, type Context } from 'grammy';
import type { Aplicacao, Log } from './aplicacao';
import type { Resposta } from './formatacao';

export const COMANDOS = ['start', 'ajuda', 'novo', 'pagar', 'hoje', 'semana', 'atrasados', 'cliente', 'resumo'] as const;

/** Opções de envio (HTML + teclado inline, se houver). */
export function opcoesEnvio(r: Resposta) {
  if (!r.teclado?.length) return { parse_mode: 'HTML' as const };
  return {
    parse_mode: 'HTML' as const,
    reply_markup: InlineKeyboard.from(r.teclado.map((linha) => linha.map((b) => InlineKeyboard.text(b.texto, b.dados)))),
  };
}

async function responder(ctx: Context, respostas: Resposta[], log: Log): Promise<void> {
  for (const r of respostas) {
    const extra = opcoesEnvio(r);
    if (r.editarOriginal && ctx.callbackQuery?.message) {
      try {
        await ctx.editMessageText(r.texto, extra);
        continue;
      } catch (e) {
        // "message is not modified" e mensagens antigas: cai para envio normal
        if (!(e instanceof GrammyError)) throw e;
        log.info({ err: e.description }, 'não foi possível editar mensagem');
      }
    }
    await ctx.reply(r.texto, extra);
  }
}

export function criarBot(token: string, app: Aplicacao, permitidos: readonly number[], log: Log): Bot {
  const bot = new Bot(token);
  const whitelist = new Set(permitidos);

  // Segurança: ignora silenciosamente quem não está na whitelist.
  bot.use(async (ctx, next) => {
    const id = ctx.from?.id;
    if (!id || !whitelist.has(id)) {
      if (id) log.info({ id }, 'usuário fora da whitelist ignorado');
      return;
    }
    await next();
  });

  for (const nome of COMANDOS) {
    bot.command(nome, async (ctx) => {
      await ctx.replyWithChatAction('typing').catch(() => {});
      await responder(ctx, await app.comando(ctx.from!.id, nome, ctx.match ?? ''), log);
    });
  }

  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) {
      await ctx.reply('Comando desconhecido. Veja /ajuda.');
      return;
    }
    await ctx.replyWithChatAction('typing').catch(() => {});
    await responder(ctx, await app.mensagem(ctx.from.id, ctx.message.text), log);
  });

  bot.on('message', (ctx) => ctx.reply('Por enquanto só entendo mensagens de texto. 🙂'));

  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    // Botões de uso único (confirmação/escolhas) somem após o clique; os dos alertas ficam.
    const prefixo = ctx.callbackQuery.data.split(':')[0] ?? '';
    if (!['rt', 'rp', 'ad', 'al'].includes(prefixo)) {
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
    }
    await responder(ctx, await app.callback(ctx.from.id, ctx.callbackQuery.data), log);
  });

  bot.catch((err) => log.error({ err: err.error }, 'erro no bot'));
  return bot;
}

export async function registrarComandos(bot: Bot): Promise<void> {
  await bot.api.setMyCommands([
    { command: 'hoje', description: 'Vencimentos de hoje e atrasados' },
    { command: 'semana', description: 'A receber nesta semana' },
    { command: 'atrasados', description: 'Quem está atrasado' },
    { command: 'resumo', description: 'Visão geral da carteira' },
    { command: 'cliente', description: 'Situação de um cliente' },
    { command: 'novo', description: 'Novo empréstimo (sem IA)' },
    { command: 'pagar', description: 'Registrar pagamento (sem IA)' },
    { command: 'ajuda', description: 'Como usar' },
  ]);
}
