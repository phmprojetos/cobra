import { Bot, GrammyError, InlineKeyboard, type Context } from 'grammy';
import type { Aplicacao, Log } from './aplicacao';
import { escapar, type Resposta } from './formatacao';
import type { Transcritor } from './ia/transcricao';

export interface OpcoesAudio {
  transcritor: Transcritor | null;
  /** Duração máxima aceita (segundos), para controlar custo. */
  maxSegundos: number;
  /** Baixa um arquivo do Telegram pelo file_path (injetável nos testes). */
  baixar: (filePath: string) => Promise<Uint8Array>;
}

export const COMANDOS = ['start', 'ajuda', 'novo', 'pagar', 'hoje', 'semana', 'atrasados', 'clientes', 'cliente', 'resumo'] as const;

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

export function criarBot(token: string, app: Aplicacao, permitidos: readonly number[], log: Log, audio?: OpcoesAudio): Bot {
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

  // Áudio: transcreve e segue o mesmo fluxo do texto (mostrando o que foi entendido).
  bot.on(['message:voice', 'message:audio'], async (ctx) => {
    const midia = ctx.message.voice ?? ctx.message.audio!;
    if (!audio?.transcritor) {
      await ctx.reply('🎙️ Áudio ainda não está ativado. Por enquanto, mande por texto. 🙂');
      return;
    }
    if (midia.duration > audio.maxSegundos) {
      await ctx.reply(`🎙️ Áudio muito longo (máx. ${audio.maxSegundos}s). Mande um mais curto ou por texto.`);
      return;
    }
    await ctx.replyWithChatAction('typing').catch(() => {});
    let texto: string | null = null;
    try {
      const arquivo = await ctx.getFile();
      if (!arquivo.file_path) throw new Error('arquivo sem file_path');
      const nome = arquivo.file_path.split('/').pop() ?? 'audio.ogg';
      texto = await audio.transcritor.transcrever(await audio.baixar(arquivo.file_path), nome.endsWith('.oga') ? nome.replace(/\.oga$/, '.ogg') : nome);
    } catch (err) {
      log.error({ err }, 'falha na transcrição');
      await ctx.reply('🎙️ Não consegui ouvir o áudio agora. Tenta de novo ou manda por texto.');
      return;
    }
    if (!texto) {
      await ctx.reply('🎙️ Não entendi nada no áudio. Pode repetir?');
      return;
    }
    await ctx.reply(`🎙️ <i>${escapar(texto)}</i>`, { parse_mode: 'HTML' });
    await responder(ctx, await app.mensagem(ctx.from.id, texto), log);
  });

  bot.on('message', (ctx) => ctx.reply('Por enquanto entendo texto e áudio. 🙂'));

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
    { command: 'clientes', description: 'Lista de clientes (nome e documento)' },
    { command: 'cliente', description: 'Ficha de um cliente (nome ou documento)' },
    { command: 'novo', description: 'Novo empréstimo (sem IA)' },
    { command: 'pagar', description: 'Registrar pagamento (sem IA)' },
    { command: 'ajuda', description: 'Como usar' },
  ]);
}
