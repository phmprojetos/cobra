import { createClient } from '@supabase/supabase-js';
import { somarDias } from '@cobra/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  atualizarStatus,
  cancelarOperacao,
  criarClienteServico,
  executarOperacao,
  executarPagamento,
  executarRenegociacao,
  marcarPerda,
  planejarOperacao,
  planejarPagamento,
  planejarRenegociacao,
  Repositorio,
  type Database,
} from '../src';

// Chaves de demonstração padrão do `supabase start` (somente ambiente local).
const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const disponivel = await fetch(`${URL}/rest/v1/`, { headers: { apikey: ANON } })
  .then((r) => r.status < 500)
  .catch(() => false);

const meta = { origem: 'telegram' as const, mensagemTelegram: 'teste' };

describe.skipIf(!disponivel)('integração com Supabase local', () => {
  const db = criarClienteServico(URL, SERVICE);
  const repo = new Repositorio(db);
  let hoje: string;
  let clienteId: string;
  const sufixo = Date.now().toString(36);

  beforeAll(async () => {
    hoje = await repo.hoje();
    const c = await repo.criarCliente({ nome: `Teste ${sufixo}`, apelidos: [`Zé Tést ${sufixo}`] });
    clienteId = c.id;
  });

  // Não polui o bot/painel de desenvolvimento.
  afterAll(async () => {
    await db.from('clientes').update({ ativo: false }).eq('id', clienteId);
  });

  it('cria operação parcelada e registra evento', async () => {
    const plano = await planejarOperacao(repo, {
      clienteId,
      dataEmprestimo: hoje,
      principal: 50000,
      totalReceber: 60000,
      numeroParcelas: 4,
      primeiroVencimento: somarDias(hoje, 3),
      periodicidade: 'semanal',
    });
    const id = await executarOperacao(repo, plano, meta);
    const c = await repo.carregarCarteira({ operacaoId: id });
    expect(c.parcelas).toHaveLength(4);
    expect(c.operacoes[0]).toMatchObject({ tipo: 'parcelada', juros_total: 10000, status: 'ativa' });
    const ev = await repo.eventos([id]);
    expect(ev[0]).toMatchObject({ acao: 'criar', mensagem_telegram: 'teste' });
  });

  it('pagamento acima da parcela abate a próxima (mesmo lote)', async () => {
    const plano = await planejarPagamento(repo, { clienteId, valor: 20000 });
    expect(plano.alocacoes.map((a) => [a.numero, a.valor, a.novoStatus])).toEqual([
      [1, 15000, 'paga'],
      [2, 5000, 'parcial'],
    ]);
    const lote = await executarPagamento(repo, plano, meta);
    const pags = (await db.from('pagamentos').select('*').eq('lote_id', lote)).data!;
    expect(pags).toHaveLength(2);
    expect(pags.reduce((a, p) => a + p.valor, 0)).toBe(20000);
  });

  it('confirmar o mesmo plano duas vezes falha (conflito otimista)', async () => {
    const plano = await planejarPagamento(repo, { clienteId, valor: 100 });
    await executarPagamento(repo, plano, meta);
    await expect(executarPagamento(repo, plano, meta)).rejects.toThrow(/conflito/);
  });

  it('pagamento maior que o saldo total é recusado', async () => {
    const plano = await planejarPagamento(repo, { clienteId, valor: 99_999_999 });
    expect(plano.excedente).toBeGreaterThan(0);
    await expect(executarPagamento(repo, plano, meta)).rejects.toThrow(/maior que o saldo/);
  });

  it('prorroga com acréscimo, registra antes/depois e marca renegociada', async () => {
    const c = await repo.carregarCarteira({ clienteId });
    const p3 = c.parcelas.find((p) => p.numero === 3)!;
    const plano = await planejarRenegociacao(repo, {
      parcelaId: p3.id,
      novoVencimento: somarDias(p3.vencimento, 10),
      acrescimo: 1000,
    });
    await executarRenegociacao(repo, plano, meta);
    const depois = await repo.carregarCarteira({ clienteId });
    expect(depois.parcelas.find((p) => p.id === p3.id)).toMatchObject({ valor: 16000, valor_juros: 3500 });
    expect(depois.operacoes[0]).toMatchObject({ status: 'renegociada', renegociacoes: 1, valor_total_receber: 61000 });
    const ev = (await repo.eventos([p3.id]))[0]!;
    expect(ev.acao).toBe('renegociar');
    expect(ev.payload).toMatchObject({ antes: { valor: 15000 }, depois: { valor: 16000 } });
    // Mesmo plano de novo: conflito
    await expect(executarRenegociacao(repo, plano, meta)).rejects.toThrow(/conflito/);
  });

  it('perda registra prejuízo = principal em aberto', async () => {
    const c = await repo.carregarCarteira({ clienteId });
    const perda = await marcarPerda(repo, c.operacoes[0]!.id, meta);
    expect(perda.prejuizo).toBeGreaterThan(0);
    const op = (await repo.carregarCarteira({ operacaoId: c.operacoes[0]!.id })).operacoes[0]!;
    expect(op).toMatchObject({ status: 'perdida', valor_prejuizo: perda.prejuizo, perdida_em: hoje });
  });

  it('atualiza status de parcelas vencidas e cancela operação', async () => {
    const plano = await planejarOperacao(repo, {
      clienteId,
      dataEmprestimo: somarDias(hoje, -30),
      principal: 10000,
      totalReceber: 12000,
      numeroParcelas: 1,
      primeiroVencimento: somarDias(hoje, -1),
      periodicidade: 'mensal',
    });
    const id = await executarOperacao(repo, plano, meta);
    expect(await atualizarStatus(repo)).toBeGreaterThanOrEqual(2);
    const c = await repo.carregarCarteira({ operacaoId: id });
    expect(c.operacoes[0]!.status).toBe('atrasada');
    expect(c.parcelas[0]!.status).toBe('atrasada');
    await cancelarOperacao(repo, id, 'teste', meta);
    const cancelada = (await db.from('operacoes').select('status').eq('id', id).single()).data!;
    expect(cancelada.status).toBe('cancelada');
  });

  it('notificação é idempotente (unique com parcela nula)', async () => {
    const regra = (await repo.regras()).find((r) => r.tipo === 'resumo_diario')!;
    const data = '1999-01-01';
    const a = await repo.reservarNotificacao(regra.id, null, data);
    const b = await repo.reservarNotificacao(regra.id, null, data);
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    await repo.liberarNotificacao(a!);
  });

  it('sessão do bot é consumida uma única vez', async () => {
    const id = await repo.criarSessao(1, 'confirmar', { x: 1 });
    expect((await repo.obterSessao(id))?.payload).toEqual({ x: 1 });
    expect(await repo.consumirSessao(id)).toBe(true);
    expect(await repo.consumirSessao(id)).toBe(false);
    expect(await repo.obterSessao(id)).toBeNull();
  });

  it('busca cliente por apelido sem acento', async () => {
    const r = await repo.buscarClientes(`ze test ${sufixo}`);
    expect(r[0]!.id).toBe(clienteId);
  });

  describe('RLS', () => {
    it('anon não lê nada nem chama RPC', async () => {
      const anon = createClient<Database>(URL, ANON);
      const { data } = await anon.from('operacoes').select('id');
      expect(data ?? []).toHaveLength(0);
      const rpc = await anon.rpc('rpc_atualizar_status', { p: {} });
      expect(rpc.error).not.toBeNull();
    });

    it('autenticado lê, edita config, mas não grava operações diretamente', async () => {
      const email = `painel-${Date.now()}@teste.local`;
      await db.auth.admin.createUser({ email, password: 'senha-teste-123', email_confirm: true });
      const user = createClient<Database>(URL, ANON, { auth: { persistSession: false } });
      const login = await user.auth.signInWithPassword({ email, password: 'senha-teste-123' });
      expect(login.error).toBeNull();

      const ops = await user.from('operacoes').select('id');
      expect(ops.data!.length).toBeGreaterThan(0);
      const sess = await user.from('sessoes_bot').select('id');
      expect(sess.data).toHaveLength(0);

      const ins = await user.from('operacoes').insert({} as never);
      expect(ins.error).not.toBeNull();

      const upd = await user.from('configuracoes').update({ valor: '"BRL"' }).eq('chave', 'moeda').select();
      expect(upd.data).toHaveLength(1);
      const audit = await user.from('eventos').select('*').eq('entidade', 'configuracoes').order('created_at', { ascending: false }).limit(1);
      expect(audit.data![0]!.payload).toMatchObject({ chave: 'moeda' });
    });
  });
});
