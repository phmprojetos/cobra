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

export const COMANDOS = ['start', 'ajuda', 'novo', 'pagar', 'hoje', 'semana', 'atrasados', 'clientes', 'cliente', 'pesquisa', 'editar', 'resumo', 'canal'] as const;

/** Opções de envio (HTML + teclado inline, se houver). */
export function opcoesEnvio(r: Resposta) {
  if (!r.teclado?.length) return { parse_mode: 'HTML' as const };
  return {
    parse_mode: 'HTML' as const,
    reply_markup: InlineKeyboard.from(
      r.teclado.map((linha) => linha.map((b) =>
          b.url ? InlineKeyboard.url(b.texto, b.url) : b.copiar ? InlineKeyboard.copyText(b.texto, b.copiar) : InlineKeyboard.text(b.texto, b.dados),
        )),
    ),
  };
}

async function responder(ctx: Ctx, respostas: Resposta[], log: Log): Promise<void> {
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

/** Quem pode usar o bot e com qual carteira (cada Telegram vinculado aponta para uma carteira). */
export interface AcessoBot {
  /** Aplicação da carteira deste Telegram, ou null se ele não está vinculado. */
  app(telegramUserId: number): Promise<Aplicacao | null>;
  /** Consome o código de vínculo gerado no painel. true = vinculado. */
  vincular(codigo: string, telegramUserId: number, nome: string | null): Promise<boolean>;
}

/** Acesso fixo (testes): uma aplicação para uma lista de Telegrams. */
export function acessoFixo(app: Aplicacao, permitidos: readonly number[]): AcessoBot {
  const ids = new Set(permitidos);
  return { app: async (id) => (ids.has(id) ? app : null), vincular: async () => false };
}

export const TEXTO_NAO_VINCULADO =
  '🔒 Este bot é privado.\nPara usar, entre no painel e vá em <b>Configurações → Telegram → Vincular meu Telegram</b>.';

type Ctx = Context & { app: Aplicacao };

export function criarBot(token: string, acesso: AcessoBot, log: Log, audio?: OpcoesAudio): Bot<Ctx> {
  const bot = new Bot<Ctx>(token);

  // Segurança: só Telegrams vinculados a uma carteira. Cada um opera apenas a própria carteira.
  bot.use(async (ctx, next) => {
    const id = ctx.from?.id;
    if (!id) return;
    const app = await acesso.app(id);
    if (app) {
      ctx.app = app;
      await next();
      return;
    }
    // Fora de conversas privadas (canais/grupos), ignora em silêncio.
    if (ctx.chat?.type !== 'private' || !ctx.message) return;
    const codigo = /^\/start\s+v_([A-Za-z0-9]+)$/.exec(ctx.message.text ?? '')?.[1];
    if (codigo) {
      const nome = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || ctx.from.username || null;
      const ok = await acesso.vincular(codigo, id, nome);
      log.info({ id, ok }, 'vínculo de telegram');
      await ctx.reply(ok ? '✅ Telegram vinculado à sua carteira! Mande /ajuda para começar.' : '⌛ Código inválido ou expirado. Gere outro no painel.');
      return;
    }
    log.info({ id }, 'telegram não vinculado');
    await ctx.reply(TEXTO_NAO_VINCULADO, { parse_mode: 'HTML' });
  });

  // Bot adicionado/removido como admin de um canal ou grupo (por um usuário autorizado):
  // conecta/desconecta o canal de alertas e avisa no chat privado de quem fez a ação.
  bot.on('my_chat_member', async (ctx) => {
    const { chat, new_chat_member: novo } = ctx.myChatMember;
    if (chat.type === 'private') return;
    const titulo = chat.title;
    const ativo = novo.status === 'administrator' || (novo.status === 'member' && chat.type !== 'channel');
    const respostas = ativo
      ? await ctx.app.conectarCanal(ctx.from.id, { id: chat.id, titulo })
      : await ctx.app.desconectarCanal(chat.id);
    for (const r of respostas) await ctx.api.sendMessage(ctx.from.id, r.texto, opcoesEnvio(r)).catch((err) => log.error({ err }, 'aviso de canal'));
  });

  for (const nome of COMANDOS) {
    bot.command(nome, async (ctx) => {
      await ctx.replyWithChatAction('typing').catch(() => {});
      await responder(ctx, await ctx.app.comando(ctx.from!.id, nome, ctx.match ?? ''), log);
    });
  }

  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) {
      await ctx.reply('Comando desconhecido. Veja /ajuda.');
      return;
    }
    await ctx.replyWithChatAction('typing').catch(() => {});
    await responder(ctx, await ctx.app.mensagem(ctx.from.id, ctx.message.text), log);
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
    await responder(ctx, await ctx.app.mensagem(ctx.from.id, texto), log);
  });

  bot.on('message', (ctx) => ctx.reply('Por enquanto entendo texto e áudio. 🙂'));

  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    // Botões de uso único (confirmação/escolhas) somem após o clique; os dos alertas ficam.
    const prefixo = ctx.callbackQuery.data.split(':')[0] ?? '';
    if (!['rt', 'rp', 'ad', 'al'].includes(prefixo)) {
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
    }
    await responder(ctx, await ctx.app.callback(ctx.from.id, ctx.callbackQuery.data), log);
  });

  bot.catch((err) => log.error({ err: err.error }, 'erro no bot'));
  return bot;
}

export async function registrarComandos(bot: Pick<Bot, 'api'>): Promise<void> {
  await bot.api.setMyCommands([
    { command: 'hoje', description: 'Vencimentos de hoje e atrasados' },
    { command: 'semana', description: 'A receber nesta semana' },
    { command: 'atrasados', description: 'Quem está atrasado' },
    { command: 'resumo', description: 'Visão geral da carteira' },
    { command: 'clientes', description: 'Lista de clientes (nome e documento)' },
    { command: 'pesquisa', description: 'Pesquisar cliente por nome ou documento' },
    { command: 'cliente', description: 'Ficha de um cliente (nome ou documento)' },
    { command: 'editar', description: 'Editar cadastro de um cliente' },
    { command: 'novo', description: 'Novo empréstimo (sem IA)' },
    { command: 'pagar', description: 'Registrar pagamento (sem IA)' },
    { command: 'canal', description: 'Canal de alertas (status/teste)' },
    { command: 'ajuda', description: 'Como usar' },
  ]);
}
