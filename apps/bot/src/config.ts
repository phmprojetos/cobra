import { z } from 'zod';

const esquema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(10),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(''),
  /** No modo webhook, registrado no Telegram ao iniciar (ex.: https://dominio/telegram). */
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-haiku-5-5'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  MOEDA: z.string().optional(),
  LOCALE: z.string().optional(),
  TIMEZONE: z.string().optional(),
  BOT_MODO: z.enum(['polling', 'webhook']).default('polling'),
  PORT: z.coerce.number().default(8080),
  /** Protege POST /jobs/notificacoes quando acionado externamente. */
  JOB_SECRET: z.string().default(''),
  /** Liga o agendador interno (a cada 15 min). */
  NOTIFICACOES_CRON: z
    .string()
    .default('true')
    .transform((s) => s !== 'false'),
  LOG_LEVEL: z.string().default('info'),
  /** Transcrição de áudio (Groq/Whisper). Sem chave, áudio fica desativado. */
  GROQ_API_KEY: z.string().default(''),
  GROQ_MODELO_AUDIO: z.string().default('whisper-large-v3-turbo'),
  AUDIO_MAX_SEGUNDOS: z.coerce.number().default(120),
});

export type ConfigBot = z.infer<typeof esquema>;

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): ConfigBot {
  const r = esquema.safeParse(env);
  if (!r.success) {
    const erros = r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${erros}`);
  }
  const c = r.data;
  if (c.BOT_MODO === 'webhook' && c.TELEGRAM_WEBHOOK_SECRET.length < 16) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET (≥ 16 caracteres) é obrigatório no modo webhook');
  }
  return c;
}
