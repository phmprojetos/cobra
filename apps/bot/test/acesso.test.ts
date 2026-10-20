import { describe, expect, it, vi } from 'vitest';
import type { Bot } from 'grammy';
import type { Aplicacao } from '../src/aplicacao';
import { criarBot, TEXTO_NAO_VINCULADO, type AcessoBot } from '../src/bot';

const silencioso = { info: () => {}, error: () => {} };

/** Bot com a API do Telegram interceptada e um acesso por carteira simulado. */
function montar(acesso: AcessoBot) {
  const enviados: { chat: number; texto: string }[] = [];
  const bot = criarBot('123:TESTE', acesso, silencioso) as unknown as Bot;
  bot.botInfo = { id: 1, is_bot: true, first_name: 'cobra', username: 'cobra_bot' } as Bot['botInfo'];
  bot.api.config.use(async (_prev, method, payload) => {
    if (method === 'sendMessage') {
      const p = payload as { chat_id: number; text: string };
      enviados.push({ chat: p.chat_id, texto: p.text });
    }
    return { ok: true, result: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } } } as never;
  });
  const texto = (de: number, text: string, chat: 'private' | 'group' = 'private') =>
    bot.handleUpdate({
      update_id: Math.floor(Math.random() * 1e6),
      message: {
        message_id: 1,
        date: 0,
        chat: chat === 'private' ? { id: de, type: 'private', first_name: 'X' } : { id: -100, type: 'group', title: 'G' },
        from: { id: de, is_bot: false, first_name: 'Ana', last_name: 'Souza' },
        text,
        ...(text.startsWith('/') ? { entities: [{ type: 'bot_command' as const, offset: 0, length: text.split(' ')[0]!.length }] } : {}),
      },
    });
  return { enviados, texto };
}

describe('acesso ao bot por carteira', () => {
  // Dois usuários, cada um na sua carteira: cada mensagem vai para a aplicação da carteira dele.
  const appA = { mensagem: vi.fn(async () => [{ texto: 'carteira A' }]) } as unknown as Aplicacao;
  const appB = { mensagem: vi.fn(async () => [{ texto: 'carteira B' }]) } as unknown as Aplicacao;
  const vincular = vi.fn(async (codigo: string) => codigo === 'ABC123');
  const acesso: AcessoBot = { app: async (id) => (id === 1 ? appA : id === 2 ? appB : null), vincular };

  it('cada Telegram opera só a própria carteira', async () => {
    const { enviados, texto } = montar(acesso);
    await texto(1, 'oi');
    await texto(2, 'oi');
    expect(enviados).toEqual([
      { chat: 1, texto: 'carteira A' },
      { chat: 2, texto: 'carteira B' },
    ]);
  });

  it('não vinculado: explica como vincular (só no privado; em grupos, silêncio)', async () => {
    const { enviados, texto } = montar(acesso);
    await texto(9, 'emprestei 100 pro João');
    await texto(9, 'oi', 'group');
    expect(enviados).toEqual([{ chat: 9, texto: TEXTO_NAO_VINCULADO }]);
  });

  it('/start v_<código> vincula; código inválido é recusado', async () => {
    const { enviados, texto } = montar(acesso);
    await texto(9, '/start v_ABC123');
    expect(vincular).toHaveBeenCalledWith('ABC123', 9, 'Ana Souza');
    expect(enviados[0]!.texto).toContain('Telegram vinculado');
    await texto(9, '/start v_ZZZ');
    expect(enviados[1]!.texto).toContain('Código inválido ou expirado');
  });
});
