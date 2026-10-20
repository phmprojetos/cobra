import { gerarParcelas, calcularIndicadores } from '@cobra/core';
import { CONFIG_PADRAO, paraOperacao, paraParcela, type CarteiraCompleta, type ClienteRow, type OperacaoRow, type ParcelaRow, type Repositorio } from '@cobra/db';
import type { Bot } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { Aplicacao } from '../src/aplicacao';
import { acessoFixo, criarBot, opcoesEnvio } from '../src/bot';
import { linkParcela, mensagemDevedoresDoDia, mensagemGrupoParcelas, mensagemNovoEmprestimo, mensagemVencemAmanha } from '../src/canal';
import { Formatador } from '../src/formatacao';

const hoje = '2026-10-20';
const agora = '2026-10-20T00:00:00Z';
const f = new Formatador(CONFIG_PADRAO);

const cli = (id: string, nome: string, doc: string): ClienteRow => ({
  id, nome, apelidos: [], documento_tipo: 'cpf', documento: doc, telefone: null, observacoes: null, ativo: true, created_at: agora, updated_at: agora, carteira_id: 'c1',
});
const op = (id: string, clienteId: string): OperacaoRow => ({
  id, cliente_id: clienteId, data_emprestimo: '2026-09-01', valor_principal: 100000, valor_total_receber: 130000, juros_total: 30000,
  taxa_periodo: 0.3, taxa_efetiva_mensal: 0.1, tipo: 'unica', periodicidade: null, status: 'ativa', renegociacoes: 0, valor_prejuizo: 0,
  perdida_em: null, cancelado_em: null, observacoes: null, origem: 'telegram', mensagem_origem_id: null, created_at: agora, updated_at: agora, carteira_id: 'c1',
});
const par = (id: string, opId: string, vencimento: string, pago = 0): ParcelaRow => ({
  id, operacao_id: opId, numero: 1, vencimento, valor: 130000, valor_principal: 100000, valor_juros: 30000,
  valor_pago: pago, principal_pago: Math.round((pago * 10) / 13), juros_pago: pago - Math.round((pago * 10) / 13),
  status: 'aberta', cancelado_em: null, created_at: agora, updated_at: agora, carteira_id: 'c1',
});

function carteira(parcelas: ParcelaRow[]): CarteiraCompleta {
  const clientes = [cli('c1', 'Pedro Miquiles', '11219819417'), cli('c2', 'Ana Paula', '52998224725')];
  const operacoes = [op('o1', 'c1'), op('o2', 'c2')];
  return {
    clientes: new Map(clientes.map((c) => [c.id, c])),
    operacoes,
    parcelas,
    pagamentos: [],
    carteira: { operacoes: operacoes.map(paraOperacao), parcelas: parcelas.map(paraParcela), pagamentos: [] },
  };
}

describe('mensagens do canal', () => {
  it('link abre a parcela no chat privado', () => {
    expect(linkParcela('cobraphm_bot', 'abc')).toBe('https://t.me/cobraphm_bot?start=p_abc');
  });

  it('próximos vencimentos: ALERTA agrupado com total e botões-link', () => {
    const c = carteira([par('p1', 'o1', '2026-10-21'), par('p2', 'o2', '2026-10-21', 30000)]);
    const m = mensagemGrupoParcelas('lembrete_antes', ['p1', 'p2'], c, hoje, f, 'bot')!;
    expect(m.texto).toContain('⚠️ <b>ALERTA · vencem em 21/10 (qua)</b>');
    expect(m.texto).toContain('2 contrato(s) · total <b>R$ 2.300,00</b>');
    expect(m.texto).toContain('• <b>Pedro Miquiles</b> — R$ 1.300,00');
    expect(m.texto).toContain('• <b>Ana Paula</b> — R$ 1.000,00');
    expect(m.teclado!.map((l) => l[0]!.url)).toEqual(['https://t.me/bot?start=p_p1', 'https://t.me/bot?start=p_p2']);
  });

  it('vencimento do dia e grupo vazio', () => {
    const c = carteira([par('p1', 'o1', hoje), par('p2', 'o2', hoje, 130000)]);
    const m = mensagemGrupoParcelas('no_dia', ['p1', 'p2'], c, hoje, f, 'bot')!;
    expect(m.texto).toContain('📅 <b>Vencem hoje (20/10 (ter))</b>');
    expect(m.texto).not.toContain('Ana Paula'); // já quitada
    expect(mensagemGrupoParcelas('no_dia', ['p2'], c, hoje, f, 'bot')).toBeNull();
    expect(mensagemGrupoParcelas('atraso', ['p1'], carteira([par('p1', 'o1', '2026-10-17')]), hoje, f, 'bot')!.texto).toContain('Atrasados desde 17/10');
  });

  it('devedores do dia: vencem hoje + atrasados, com total, hora e documento', () => {
    const c = carteira([par('p1', 'o1', '2026-10-15'), par('p2', 'o2', hoje), par('p3', 'o2', '2026-11-01')]);
    const m = mensagemDevedoresDoDia(c, hoje, '13:00', f, 'bot');
    expect(m.texto).toContain('📋 <b>Devedores do dia · 20/10 (ter)</b>');
    expect(m.texto).toContain('2 contrato(s) · total <b>R$ 2.600,00</b> · <i>atualizado às 13:00</i>');
    expect(m.texto).toContain('📅 <b>Vencem hoje</b> (1) · R$ 1.300,00\n• <b>Ana Paula</b> · parcela 1/2 — R$ 1.300,00');
    expect(m.texto).toContain('🔴 <b>Atrasados</b> (1) · R$ 1.300,00');
    expect(m.texto).toContain('5 dia(s) de atraso · venceu 15/10 (qui) · 112.198.194-17');
    expect(m.teclado!.map((l) => l[0]!.url)).toEqual(['https://t.me/bot?start=p_p2', 'https://t.me/bot?start=p_p1']);
  });

  it('sem devedores: mensagem explícita', () => {
    const m = mensagemDevedoresDoDia(carteira([par('p3', 'o2', '2026-11-01')]), hoje, '18:00', f, 'bot');
    expect(m.texto).toBe('✅ <b>Nenhum devedor hoje (20/10 (ter))</b>\nNinguém vence hoje e não há contratos atrasados.\n<i>atualizado às 18:00</i>');
    expect(m.teclado).toBeUndefined();
  });

  it('só atrasados ou só de hoje', () => {
    expect(mensagemDevedoresDoDia(carteira([par('p1', 'o1', '2026-10-15')]), hoje, '09:00', f, 'b').texto).not.toContain('Vencem hoje');
    expect(mensagemDevedoresDoDia(carteira([par('p2', 'o2', hoje)]), hoje, '09:00', f, 'b').texto).not.toContain('Atrasados');
  });

  it('vencem amanhã: só quem vence amanhã, maior valor primeiro, com documento', () => {
    const c = carteira([par('p1', 'o1', '2026-10-21'), par('p2', 'o2', '2026-10-21'), par('p3', 'o2', '2026-10-15')]);
    const m = mensagemVencemAmanha(c, hoje, '20:00', f, 'bot');
    expect(m.texto).toContain('📆 <b>Vencem amanhã · 21/10 (qua)</b>');
    expect(m.texto).toContain('2 contrato(s) · total <b>R$ 2.600,00</b> · <i>atualizado às 20:00</i>');
    expect(m.texto).toContain('CPF <code>112.198.194-17</code>');
    expect(m.texto).not.toContain('atraso');
    expect(m.teclado).toHaveLength(2);
  });

  it('ninguém vence amanhã', () => {
    const m = mensagemVencemAmanha(carteira([par('p3', 'o2', '2026-10-15')]), hoje, '20:00', f, 'bot');
    expect(m.texto).toBe('📆 <b>Vencem amanhã · 21/10 (qua)</b>\n✅ Ninguém vence amanhã.\n<i>atualizado às 20:00</i>');
    expect(m.teclado).toBeUndefined();
  });

  it('novo empréstimo', () => {
    const parcelas = gerarParcelas({ dataEmprestimo: hoje, principal: 100000, totalReceber: 130000, numeroParcelas: 1, primeiroVencimento: '2026-11-20', periodicidade: 'mensal' });
    const plano = {
      entrada: { clienteId: 'c1', dataEmprestimo: hoje, principal: 100000, totalReceber: 130000, numeroParcelas: 1, primeiroVencimento: '2026-11-20', periodicidade: 'mensal' as const },
      clienteNome: 'Pedro Miquiles',
      parcelas,
      indicadores: calcularIndicadores({ dataEmprestimo: hoje, principal: 100000, parcelas }),
    };
    const m = mensagemNovoEmprestimo(plano, '112.198.194-17', hoje, f);
    expect(m.texto).toBe(
      '🆕 <b>Novo empréstimo</b>\n<b>Pedro Miquiles</b> · 112.198.194-17\nEmprestado R$ 1.000,00 → recebe <b>R$ 1.300,00</b> (juros R$ 300,00)\nvence 20/11 (sex) · 28,90% a.m.',
    );
    const parcelado = { ...plano, entrada: { ...plano.entrada, periodicidade: 'semanal' as const }, parcelas: gerarParcelas({ ...plano.entrada, principal: 100000, totalReceber: 130000, numeroParcelas: 4, periodicidade: 'semanal' }) };
    expect(mensagemNovoEmprestimo(parcelado, '—', hoje, f).texto).toContain('4 parcelas semanais de R$ 325,00 a partir de 20/11');
  });

  it('botões-link viram url no teclado do Telegram', () => {
    const o = opcoesEnvio({ texto: 'x', teclado: [[{ texto: 'Abrir', dados: '', url: 'https://t.me/bot?start=p_1' }]] });
    expect(JSON.stringify(o.reply_markup)).toContain('"url":"https://t.me/bot?start=p_1"');
  });
});

describe('conexão do canal', () => {
  function repoFake() {
    let canal: { id: number; titulo: string } | null = null;
    return {
      salvarCanalAlertas: vi.fn(async (c: typeof canal) => void (canal = c)),
      configuracao: async () => ({ ...CONFIG_PADRAO, canalAlertas: canal }),
    };
  }

  it('bot virou admin de um canal: conecta, testa o canal e avisa no privado', async () => {
    const repo = repoFake();
    const enviar = vi.fn(async () => 1);
    const app = new Aplicacao(repo as unknown as Repositorio, { interpretar: async () => ({ tipo: 'falha', motivo: '' }) }, { info: () => {}, error: () => {} }, enviar);
    const enviados: { chat: number; texto: string }[] = [];
    const bot = criarBot('1:T', acessoFixo(app, [771585420]), { info: () => {}, error: () => {} }) as unknown as Bot;
    bot.botInfo = { id: 1, is_bot: true, first_name: 'cobra', username: 'cobraphm_bot' } as Bot['botInfo'];
    bot.api.config.use(async (_prev, method, payload) => {
      if (method === 'sendMessage') enviados.push({ chat: (payload as { chat_id: number }).chat_id, texto: (payload as { text: string }).text });
      return { ok: true, result: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } } } as never;
    });
    const evento = (status: 'administrator' | 'left', de = 771585420) =>
      bot.handleUpdate({
        update_id: Math.floor(Math.random() * 1e6),
        my_chat_member: {
          chat: { id: -1001234, type: 'channel', title: 'Cobra · Alertas' },
          from: { id: de, is_bot: false, first_name: 'P' },
          date: 0,
          old_chat_member: { status: 'left', user: { id: 1, is_bot: true, first_name: 'cobra' } },
          new_chat_member: status === 'administrator'
            ? ({ status, user: { id: 1, is_bot: true, first_name: 'cobra' }, can_post_messages: true } as never)
            : { status, user: { id: 1, is_bot: true, first_name: 'cobra' } },
        },
      });

    // Usuário fora da whitelist não consegue conectar
    await evento('administrator', 999);
    expect(repo.salvarCanalAlertas).not.toHaveBeenCalled();

    await evento('administrator');
    expect(repo.salvarCanalAlertas).toHaveBeenCalledWith({ id: -1001234, titulo: 'Cobra · Alertas' });
    expect(enviar).toHaveBeenCalledWith(-1001234, expect.objectContaining({ texto: expect.stringContaining('Canal de alertas conectado') }));
    expect(enviados.at(-1)).toMatchObject({ chat: 771585420, texto: expect.stringContaining('Cobra · Alertas</b> conectado') });

    await evento('left');
    expect(repo.salvarCanalAlertas).toHaveBeenLastCalledWith(null);
    expect(enviados.at(-1)!.texto).toContain('voltam a chegar aqui');
  });
});
