import { completarCpf, formatarDocumento, instanteLocal, somarDias } from '@cobra/core';
import { criarClienteServico, Repositorio } from '@cobra/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Bot } from 'grammy';
import { Aplicacao } from '../src/aplicacao';
import { criarBot } from '../src/bot';
import type { Resposta } from '../src/formatacao';
import type { Intencao } from '../src/ia/ferramentas';
import type { ContextoInterpretacao, Interpretador, ResultadoInterpretacao } from '../src/ia/interpretador';
import { executarJobNotificacoes } from '../src/notificacoes';

const URL = process.env.SUPABASE_TEST_URL ?? '';
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? '';
/**
 * Integração contra um projeto Supabase DE TESTE (SUPABASE_TEST_*), nunca o de produção:
 * grava clientes, operações e um usuário de Auth "@teste.local". Só roda com RUN_DB_TESTS=1.
 * Limpeza: psql "$SUPABASE_TEST_DB_URL" -f scripts/limpar-dados-teste.sql
 */
const disponivel =
  !!process.env.RUN_DB_TESTS && !!URL && !!SERVICE && URL !== process.env.SUPABASE_URL; // trava: nunca a URL de produção

/** Interpretador simulado: devolve a intenção registrada para cada texto. */
class InterpretadorFake implements Interpretador {
  respostas = new Map<string, (ctx: ContextoInterpretacao) => ResultadoInterpretacao>();
  ultimoContexto: ContextoInterpretacao | null = null;
  async interpretar(texto: string, ctx: ContextoInterpretacao) {
    this.ultimoContexto = ctx;
    return this.respostas.get(texto)?.(ctx) ?? { tipo: 'falha' as const, motivo: 'fake_sem_resposta' };
  }
}

const silencioso = { info: () => {}, error: (o: unknown) => console.error(o) };
const USER = 4242;

function botao(r: Resposta[], prefixo: string): string {
  const b = r.flatMap((x) => x.teclado ?? []).flat().find((x) => x.dados.startsWith(prefixo));
  if (!b) throw new Error(`botão ${prefixo} não encontrado em ${JSON.stringify(r)}`);
  return b.dados;
}

describe.skipIf(!disponivel)('fluxos do bot (Supabase)', () => {
  const db = disponivel ? criarClienteServico(URL, SERVICE) : (null as never);
  const repo = new Repositorio(db);
  const ia = new InterpretadorFake();
  const app = new Aplicacao(repo, ia, silencioso);
  const suf = Date.now().toString(36).toUpperCase();
  const nomeCarlos = `Carlos Teste${suf}`;
  const clientes: string[] = [];
  let hoje: string;

  // CPFs válidos e únicos por execução.
  const base = Number(String(Date.now()).slice(-8));
  const cpf = (i: number) => completarCpf(String(base * 10 + i));

  beforeAll(async () => {
    hoje = await repo.hoje();
    const nomes = [nomeCarlos, `Ana Xavier Q${suf}`, `Ana Yara Q${suf}`];
    for (const [i, nome] of nomes.entries()) {
      clientes.push((await repo.criarCliente({ nome, documento: { tipo: 'cpf', numero: cpf(i) } })).id);
    }
  });
  afterAll(async () => {
    await db.from('clientes').update({ ativo: false }).in('id', clientes);
  });

  const criar = (venc: string, total = 2400): Intencao => ({
    tipo: 'criar_operacao',
    dados: {
      cliente: `Teste${suf}`,
      documento: null,
      valor_emprestado: 2000,
      valor_total_receber: total,
      numero_parcelas: 1,
      periodicidade: 'mensal',
      primeiro_vencimento: venc,
      data_emprestimo: hoje,
      observacoes: null,
    },
  });

  it('lançar → confirmar → lembrete → baixa pelo botão', async () => {
    ia.respostas.set('emprestei', () => criar(somarDias(hoje, 1)));
    const r1 = await app.mensagem(USER, 'emprestei');
    expect(r1[0]!.texto).toContain('Novo empréstimo');
    expect(r1[0]!.texto).toContain(nomeCarlos);
    const ok = botao(r1, 'ok:');

    const r2 = await app.callback(USER, ok);
    expect(r2[0]).toMatchObject({ editarOriginal: true });
    expect(r2[0]!.texto).toContain('Registrado');
    // Duplo clique não grava duas vezes
    expect((await app.callback(USER, ok))[0]!.texto).toContain('expirou');

    const ops = (await db.from('operacoes').select('id, status').eq('cliente_id', clientes[0]!)).data!;
    expect(ops).toHaveLength(1);

    // Job às 09:30 de hoje: lembrete D-1 da parcela que vence amanhã
    const tz = (await repo.configuracao()).timezone;
    const repoJob = new Repositorio(db, {}, () => instanteLocal(hoje, '09:30', tz));
    const enviados: Resposta[] = [];
    const enviar = async (_chat: number, r: Resposta) => (enviados.push(r), enviados.length);
    await executarJobNotificacoes(repoJob, enviar, [USER], silencioso);
    const alerta = enviados.find((e) => e.texto.includes(nomeCarlos));
    expect(alerta?.texto).toContain('vence amanhã');
    const rt = botao([alerta!], 'rt:');

    // Idempotente: segunda execução não reenvia
    const antes = enviados.length;
    await executarJobNotificacoes(repoJob, enviar, [USER], silencioso);
    expect(enviados.slice(antes).some((e) => e.texto.includes(nomeCarlos))).toBe(false);

    // 💰 Recebido total → confirmação → quitado
    const r3 = await app.callback(USER, rt);
    expect(r3[0]!.texto).toContain('R$ 2.400,00');
    const r4 = await app.callback(USER, botao(r3, 'ok:'));
    expect(r4[0]!.texto).toContain('saldo restante: R$ 0,00');
    const op = (await db.from('operacoes').select('status').eq('id', ops[0]!.id).single()).data!;
    expect(op.status).toBe('quitada');
  });

  it('cliente ambíguo pergunta com botões e aprende o apelido', async () => {
    ia.respostas.set('ana pagou', () => ({ tipo: 'registrar_pagamento', dados: { cliente: `Q${suf}`, valor: 10, data: hoje, forma: null } }));
    const r = await app.mensagem(USER, 'ana pagou');
    expect(r[0]!.texto).toContain('Qual');
    const rotulos = r[0]!.teclado!.flat().map((b) => b.texto);
    // Homônimos são distinguidos pelo final do documento
    expect(rotulos).toEqual(expect.arrayContaining([`Ana Xavier Q${suf} · CPF …${cpf(1).slice(-4)}`, '❌ Cancelar']));
    expect(rotulos.some((t) => t.startsWith('➕'))).toBe(false);
    const r2 = await app.callback(USER, botao(r, 'cl:'));
    expect(r2.map((x) => x.texto).join()).toContain('Não há parcelas em aberto');
    // O termo digitado virou apelido do escolhido
    expect((await repo.cliente(clientes[1]!))?.apelidos).toContain(`Q${suf}`);
  });

  it('cliente novo exige documento; documento repetido não duplica', async () => {
    const nomeNovo = `Zé Ninguém ${suf}`;
    ia.respostas.set('novo fulano', () => ({ ...criar(somarDias(hoje, 10)), dados: { ...(criar(hoje).dados as object), cliente: nomeNovo, primeiro_vencimento: somarDias(hoje, 10) } } as Intencao));
    let r1 = await app.mensagem(USER, 'novo fulano');
    // Se houver nome parecido, o bot lista antes; seguimos por "É outra pessoa".
    if (!r1[0]!.texto.includes('qual o documento')) {
      const outra = r1[0]!.teclado!.flat().find((b) => b.dados.endsWith(':n'))!;
      expect(outra.texto).toContain('É outra pessoa');
      r1 = (await app.callback(USER, outra.dados)).slice(1);
    }
    expect(r1[0]!.texto).toContain('qual o documento');

    // Documento inválido: avisa e pergunta de novo
    const r2 = await app.mensagem(USER, '123.456.789-00');
    expect(r2[0]!.texto).toContain('CPF inválido');

    // Válido: cadastra e segue para o resumo do empréstimo
    const r3 = await app.mensagem(USER, formatarDocumento('cpf', cpf(5)));
    expect(r3[0]!.texto).toContain('cadastrado');
    expect(r3[1]!.texto).toContain('Novo empréstimo');
    await app.callback(USER, botao(r3, 'x:'));
    const novo = (await db.from('clientes').select('id, documento').eq('nome', nomeNovo).single()).data!;
    expect(novo.documento).toBe(cpf(5));
    clientes.push(novo.id);

    // Mesmo CPF com outro nome ("Zezinho"): pergunta se é a mesma pessoa, não cria outro
    ia.respostas.set('zezinho', () => ({ ...criar(somarDias(hoje, 12)), dados: { ...(criar(hoje).dados as object), cliente: `Zezinho ${suf}`, primeiro_vencimento: somarDias(hoje, 12) } } as Intencao));
    let r4 = await app.mensagem(USER, 'zezinho');
    if (!r4[0]!.texto.includes('qual o documento')) {
      r4 = (await app.callback(USER, r4[0]!.teclado!.flat().find((b) => b.dados.endsWith(':n'))!.dados)).slice(1);
    }
    const r5 = await app.mensagem(USER, cpf(5));
    expect(r5[0]!.texto).toContain(`já é de <b>${nomeNovo}</b>`);
    const r6 = await app.callback(USER, botao(r5, 'cd:'));
    expect(r6[1]!.texto).toContain('Novo empréstimo');
    await app.callback(USER, botao(r6, 'x:'));
    const docs = (await db.from('clientes').select('id').eq('documento', cpf(5))).data!;
    expect(docs).toHaveLength(1);
    expect((await repo.cliente(novo.id))?.apelidos).toContain(`Zezinho ${suf}`);
  });

  it('editar: correção vai ao interpretador com o rascunho', async () => {
    ia.respostas.set('emprestei 2', () => criar(somarDias(hoje, 20)));
    ia.respostas.set('volta 2500', (ctx) => {
      expect(ctx.rascunho?.tipo).toBe('criar_operacao');
      const d = ctx.rascunho!.dados as Extract<Intencao, { tipo: 'criar_operacao' }>['dados'];
      return { tipo: 'criar_operacao', dados: { ...d, valor_total_receber: 2500 } };
    });
    const r1 = await app.mensagem(USER, 'emprestei 2');
    const r2 = await app.callback(USER, botao(r1, 'ed:'));
    expect(r2[0]!.texto).toContain('corrigir');
    const r3 = await app.mensagem(USER, 'volta 2500');
    expect(r3[0]!.texto).toContain('R$ 2.500,00');
    // O pendente original não pode mais ser confirmado
    expect((await app.callback(USER, botao(r1, 'ok:')))[0]!.texto).toContain('expirou');
    await app.callback(USER, botao(r3, 'ok:'));
  });

  it('prorrogar "dia N" nunca antecipa; pagamento acima do saldo é recusado', async () => {
    // Operação aberta vence em hoje+20 (do teste anterior). "dia" resolvido para antes disso → avança meses.
    const anterior = somarDias(hoje, 5);
    ia.respostas.set('joga', () => ({ tipo: 'prorrogar', dados: { cliente: nomeCarlos, novo_vencimento: anterior, acrescimo: 100 } }));
    const r = await app.mensagem(USER, 'joga');
    expect(r[0]!.texto).toContain('Renegociação');
    const venc = (await db.from('parcelas').select('vencimento, operacao_id, operacoes!inner(cliente_id, status)').eq('operacoes.cliente_id', clientes[0]!).eq('operacoes.status', 'ativa').single()).data!;
    expect(venc.vencimento).toBe(somarDias(hoje, 20));
    await app.callback(USER, botao(r, 'ok:'));
    const depois = (await db.from('parcelas').select('vencimento, valor').eq('operacao_id', venc.operacao_id).single()).data!;
    expect(depois.vencimento > venc.vencimento).toBe(true);
    expect(depois.valor).toBe(260000);

    ia.respostas.set('pagou muito', () => ({ tipo: 'registrar_pagamento', dados: { cliente: nomeCarlos, valor: 999999, data: hoje, forma: null } }));
    expect((await app.mensagem(USER, 'pagou muito'))[0]!.texto).toContain('mais que o saldo');
  });

  it('falha da IA pede para reformular; consultas respondem sem gravar', async () => {
    expect((await app.mensagem(USER, '???'))[0]!.texto).toContain('Não consegui entender');
    ia.respostas.set('atrasados?', () => ({ tipo: 'consultar', dados: { tipo: 'atrasados', cliente: null, data_inicio: null, data_fim: null } }));
    expect((await app.mensagem(USER, 'atrasados?'))[0]!.texto).toMatch(/Atrasados|Ninguém atrasado/);
    expect((await app.comando(USER, 'cliente', nomeCarlos))[0]!.texto).toContain('Saldo em aberto');
    expect((await app.comando(USER, 'semana', ''))[0]!.texto).toContain('A receber');
    expect((await app.comando(USER, 'resumo', ''))[0]!.texto).toContain('Capital na rua');
    expect((await app.comando(USER, 'hoje', ''))[0]!.texto).toContain('Resumo');
  });

  it('/pagar guiado: pergunta e interpreta a resposta sem IA', async () => {
    const r = await app.comando(USER, 'pagar', '');
    expect(r[0]!.texto).toContain('Envie');
    const r2 = await app.mensagem(USER, `${nomeCarlos} 100`);
    expect(r2[0]!.texto).toContain('Pagamento recebido');
    await app.callback(USER, botao(r2, 'x:'));
  });

  it('whitelist: ignora silenciosamente quem não está autorizado', async () => {
    const chamadas: string[] = [];
    const bot = criarBot('123:TESTE', app, [USER], silencioso) as Bot;
    bot.botInfo = { id: 1, is_bot: true, first_name: 'cobra', username: 'cobra_bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false } as Bot['botInfo'];
    bot.api.config.use(async (_prev, method) => {
      chamadas.push(method);
      return { ok: true, result: { message_id: 1, date: 0, chat: { id: USER, type: 'private' } } } as never;
    });
    const update = (from: number) => ({
      update_id: Math.floor(Math.random() * 1e6),
      message: { message_id: 1, date: 0, chat: { id: from, type: 'private' as const, first_name: 'x' }, from: { id: from, is_bot: false, first_name: 'x' }, text: '/ajuda', entities: [{ type: 'bot_command' as const, offset: 0, length: 6 }] },
    });
    await bot.handleUpdate(update(999));
    expect(chamadas).toEqual([]);
    await bot.handleUpdate(update(USER));
    expect(chamadas).toContain('sendMessage');
  });
});
