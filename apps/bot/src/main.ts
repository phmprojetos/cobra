import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { criarClienteServico, Repositorio } from '@cobra/db';
import { webhookCallback } from 'grammy';
import { Aplicacao, type Log } from './aplicacao';
import { criarBot, opcoesEnvio, registrarComandos } from './bot';
import { carregarConfig } from './config';
import { InterpretadorClaude } from './ia/interpretador';
import { TranscritorGroq } from './ia/transcricao';
import { executarJobNotificacoes, type Enviar } from './notificacoes';

const log: Log = {
  info: (obj, msg) => console.log(JSON.stringify({ nivel: 'info', msg, ...(obj as object), em: new Date().toISOString() })),
  error: (obj, msg) => {
    const o = obj as { err?: unknown };
    console.error(JSON.stringify({ nivel: 'erro', msg, ...o, err: o.err instanceof Error ? o.err.stack : o.err, em: new Date().toISOString() }));
  },
};

const config = carregarConfig();
const repo = new Repositorio(criarClienteServico(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY), {
  MOEDA: config.MOEDA,
  LOCALE: config.LOCALE,
  TIMEZONE: config.TIMEZONE,
});
const ia = new InterpretadorClaude(new Anthropic({ apiKey: config.ANTHROPIC_API_KEY || null }), config.ANTHROPIC_MODEL);
const app = new Aplicacao(repo, ia, log);
const bot = criarBot(config.TELEGRAM_BOT_TOKEN, app, config.TELEGRAM_ALLOWED_USER_IDS, log, {
  transcritor: config.GROQ_API_KEY ? new TranscritorGroq(config.GROQ_API_KEY, config.GROQ_MODELO_AUDIO) : null,
  maxSegundos: config.AUDIO_MAX_SEGUNDOS,
  baixar: async (filePath) => {
    const r = await fetch(`https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${filePath}`);
    if (!r.ok) throw new Error(`download do áudio falhou: HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  },
});
log.info({ audio: config.GROQ_API_KEY ? 'ativado' : 'desativado (sem GROQ_API_KEY)' }, 'transcrição de áudio');

const enviar: Enviar = async (chatId, r) => {
  const m = await bot.api.sendMessage(chatId, r.texto, opcoesEnvio(r));
  return m.message_id;
};

let jobRodando = false;
async function rodarJob() {
  if (jobRodando) return { ignorado: true };
  jobRodando = true;
  try {
    return await executarJobNotificacoes(repo, enviar, config.TELEGRAM_ALLOWED_USER_IDS, log);
  } catch (err) {
    log.error({ err }, 'job de notificações falhou');
    throw err;
  } finally {
    jobRodando = false;
  }
}

/** Agendador interno: dispara nos minutos 00/15/30/45 (+5 s). */
function agendarJob() {
  const intervalo = 15 * 60_000;
  const proximo = intervalo - (Date.now() % intervalo) + 5_000;
  setTimeout(() => {
    void rodarJob().catch(() => {});
    void repo.limparSessoesExpiradas().catch(() => {});
    agendarJob();
  }, proximo);
}

function segredoValido(recebido: string | undefined, esperado: string): boolean {
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

const webhook =
  config.BOT_MODO === 'webhook'
    ? // grammY valida o header X-Telegram-Bot-Api-Secret-Token e responde 401 se não bater.
      webhookCallback(bot, 'http', { secretToken: config.TELEGRAM_WEBHOOK_SECRET })
    : null;

async function rotear(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    return;
  }
  if (req.method === 'POST' && url.pathname === '/telegram' && webhook) {
    await webhook(req, res);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/jobs/notificacoes') {
    if (!segredoValido(req.headers['x-job-secret'] as string | undefined, config.JOB_SECRET)) {
      res.writeHead(401).end();
      return;
    }
    const r = await rodarJob();
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(r));
    return;
  }
  res.writeHead(404).end();
}

const servidor = createServer((req, res) => {
  rotear(req, res).catch((err) => {
    log.error({ err }, 'erro http');
    if (!res.headersSent) res.writeHead(500).end();
  });
});

// Em dev (tsx watch) o processo anterior pode ainda segurar a porta por alguns instantes: tenta de novo.
let tentativas = 0;
servidor.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE' && tentativas++ < 20) {
    setTimeout(() => servidor.listen(config.PORT), 500);
    return;
  }
  log.error({ err }, 'servidor http falhou');
  process.exit(1);
});
servidor.listen(config.PORT, () => log.info({ porta: config.PORT, modo: config.BOT_MODO }, 'servidor no ar'));
await registrarComandos(bot).catch((err) => log.error({ err }, 'setMyCommands falhou'));

if (config.BOT_MODO === 'polling') {
  // Polling exige que não exista webhook registrado.
  await bot.api.deleteWebhook();
  void bot.start({ onStart: (me) => log.info({ bot: me.username }, 'polling iniciado') });
}
if (config.NOTIFICACOES_CRON) {
  agendarJob();
  void rodarJob().catch(() => {});
}

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sinal, () => {
    log.info({ sinal }, 'encerrando');
    servidor.close();
    // Não espera o long polling terminar: libera a porta e sai em no máximo 2 s.
    setTimeout(() => process.exit(0), 2_000).unref();
    void bot.stop().finally(() => process.exit(0));
  });
}
