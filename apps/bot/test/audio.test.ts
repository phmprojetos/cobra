import { describe, expect, it, vi } from 'vitest';
import type { Bot } from 'grammy';
import type { Aplicacao } from '../src/aplicacao';
import { criarBot, type OpcoesAudio } from '../src/bot';
import { TranscritorGroq, type Transcritor } from '../src/ia/transcricao';

const U = 771585420;
const silencioso = { info: () => {}, error: () => {} };

/** Bot com a API do Telegram interceptada: registra mensagens enviadas. */
function montar(audio: OpcoesAudio | undefined, app: Partial<Aplicacao>) {
  const enviados: string[] = [];
  const bot = criarBot('123:TESTE', app as Aplicacao, [U], silencioso, audio) as Bot;
  bot.botInfo = { id: 1, is_bot: true, first_name: 'cobra', username: 'cobra_bot' } as Bot['botInfo'];
  bot.api.config.use(async (_prev, method, payload) => {
    if (method === 'sendMessage') enviados.push((payload as { text: string }).text);
    if (method === 'getFile') return { ok: true, result: { file_id: 'f', file_unique_id: 'u', file_path: 'voice/file_1.oga' } } as never;
    return { ok: true, result: { message_id: 1, date: 0, chat: { id: U, type: 'private' } } } as never;
  });
  const voz = (duracao: number) =>
    bot.handleUpdate({
      update_id: Math.floor(Math.random() * 1e6),
      message: {
        message_id: 1,
        date: 0,
        chat: { id: U, type: 'private', first_name: 'P' },
        from: { id: U, is_bot: false, first_name: 'P' },
        voice: { file_id: 'f', file_unique_id: 'u', duration: duracao, mime_type: 'audio/ogg' },
      },
    });
  return { enviados, voz };
}

describe('mensagens de voz', () => {
  it('sem chave: avisa que áudio não está ativado', async () => {
    const { enviados, voz } = montar(undefined, {});
    await voz(5);
    expect(enviados[0]).toContain('ainda não está ativado');
  });

  it('transcreve, mostra o que entendeu e segue o fluxo de texto', async () => {
    const transcritor: Transcritor = { transcrever: vi.fn(async () => 'emprestei 1000 pro Pedro') };
    const baixar = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const mensagem = vi.fn(async () => [{ texto: 'resumo do empréstimo' }]);
    const { enviados, voz } = montar({ transcritor, maxSegundos: 120, baixar }, { mensagem } as Partial<Aplicacao>);
    await voz(8);
    expect(baixar).toHaveBeenCalledWith('voice/file_1.oga');
    expect(transcritor.transcrever).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), 'file_1.ogg');
    expect(mensagem).toHaveBeenCalledWith(U, 'emprestei 1000 pro Pedro');
    expect(enviados).toEqual(['🎙️ <i>emprestei 1000 pro Pedro</i>', 'resumo do empréstimo']);
  });

  it('recusa áudio longo e trata falhas', async () => {
    const falha: Transcritor = { transcrever: async () => { throw new Error('x'); } };
    const vazio: Transcritor = { transcrever: async () => null };
    const baixar = async () => new Uint8Array();
    let t = montar({ transcritor: vazio, maxSegundos: 60, baixar }, {});
    await t.voz(61);
    expect(t.enviados[0]).toContain('muito longo');
    await t.voz(5);
    expect(t.enviados[1]).toContain('Não entendi nada');
    t = montar({ transcritor: falha, maxSegundos: 60, baixar }, {});
    await t.voz(5);
    expect(t.enviados[0]).toContain('Não consegui ouvir');
  });
});

describe('TranscritorGroq', () => {
  it('envia multipart com modelo e idioma e devolve o texto', async () => {
    const fetchFake = vi.fn(async () => new Response(JSON.stringify({ text: ' emprestei 2000 ' }), { status: 200 }));
    const t = new TranscritorGroq('chave', 'whisper-large-v3-turbo', fetchFake as unknown as typeof fetch);
    expect(await t.transcrever(new Uint8Array([1]), 'a.ogg')).toBe('emprestei 2000');
    const [url, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer chave');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3-turbo');
    expect(form.get('language')).toBe('pt');
  });
  it('erro HTTP vira exceção; texto vazio vira null', async () => {
    const erro = new TranscritorGroq('k', 'm', (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch);
    await expect(erro.transcrever(new Uint8Array(), 'a.ogg')).rejects.toThrow(/401/);
    const vazio = new TranscritorGroq('k', 'm', (async () => new Response('{"text":"  "}')) as unknown as typeof fetch);
    expect(await vazio.transcrever(new Uint8Array(), 'a.ogg')).toBeNull();
  });
});
