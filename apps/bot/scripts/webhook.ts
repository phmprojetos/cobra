// Gerencia o webhook do Telegram: pnpm --filter @cobra/bot webhook:set|info|delete
const token = process.env.TELEGRAM_BOT_TOKEN;
const url = process.env.TELEGRAM_WEBHOOK_URL; // ex.: https://bot.seudominio.com/telegram
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const acao = process.argv[2];

if (!token) throw new Error('TELEGRAM_BOT_TOKEN não definido');
const api = (metodo: string, corpo?: object) =>
  fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo ?? {}),
  }).then((r) => r.json());

if (acao === 'set') {
  if (!url || !secret) throw new Error('Defina TELEGRAM_WEBHOOK_URL e TELEGRAM_WEBHOOK_SECRET');
  console.log(
    await api('setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    }),
  );
} else if (acao === 'info') {
  console.log(await api('getWebhookInfo'));
} else if (acao === 'delete') {
  console.log(await api('deleteWebhook'));
} else {
  console.log('Uso: webhook.ts set|info|delete');
}

export {};
