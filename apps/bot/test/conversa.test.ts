import { CONFIG_PADRAO, paraOperacao, paraParcela, type ClienteRow, type OperacaoRow, type ParcelaRow, type Repositorio, type SessaoBot } from '@cobra/db';
import { normalizarNome, type Documento } from '@cobra/core';
import { describe, expect, it } from 'vitest';
import { Aplicacao } from '../src/aplicacao';
import type { Resposta } from '../src/formatacao';
import type { IntencaoParcial } from '../src/ia/ferramentas';
import type { ContextoInterpretacao, Interpretador, ResultadoInterpretacao } from '../src/ia/interpretador';
import { HOJE_FIXO, PARCIAIS } from './fixtures';

/** Repositório em memória com o necessário para a conversa (sessões e clientes). */
class RepoMemoria {
  sessoes = new Map<string, SessaoBot & { criada: number }>();
  clientes: ClienteRow[] = [];
  operacoes: OperacaoRow[] = [];
  parcelas: ParcelaRow[] = [];
  private seq = 0;
  /** Só o necessário para planejarPagamento (consulta de renegociações). */
  readonly db = {
    from: () => ({
      select: () => ({ in: async (_c: string, ids: string[]) => ({ data: this.operacoes.filter((o) => ids.includes(o.id)), error: null }) }),
    }),
  };
  async carregarCarteira(filtro: { clienteId?: string; operacaoId?: string } = {}) {
    const operacoes = this.operacoes.filter((o) => (!filtro.clienteId || o.cliente_id === filtro.clienteId) && (!filtro.operacaoId || o.id === filtro.operacaoId));
    const ids = new Set(operacoes.map((o) => o.id));
    const parcelas = this.parcelas.filter((p) => ids.has(p.operacao_id));
    return {
      clientes: new Map(this.clientes.map((c) => [c.id, c])),
      operacoes,
      parcelas,
      pagamentos: [],
      carteira: { operacoes: operacoes.map(paraOperacao), parcelas: parcelas.map(paraParcela), pagamentos: [] },
    };
  }
  relogio = () => new Date();
  async configuracao() {
    return CONFIG_PADRAO;
  }
  async hoje() {
    return HOJE_FIXO;
  }
  async listarClientes() {
    return this.clientes.filter((c) => c.ativo);
  }
  async cliente(id: string) {
    return this.clientes.find((c) => c.id === id) ?? null;
  }
  async buscarClientes(termo: string) {
    return this.clientes
      .filter((c) => normalizarNome(c.nome).includes(normalizarNome(termo)))
      .map((c) => ({ ...c, similaridade: 0.5 }));
  }
  async clientePorDocumento(d: Documento) {
    return this.clientes.find((c) => c.documento_tipo === d.tipo && c.documento === d.numero) ?? null;
  }
  async criarCliente(c: { nome: string; documento: Documento; apelidos?: string[] }) {
    const agora = new Date().toISOString();
    const row: ClienteRow = {
      id: `cli-${++this.seq}`,
      nome: c.nome,
      apelidos: c.apelidos ?? [],
      telefone: null,
      observacoes: null,
      ativo: true,
      documento_tipo: c.documento.tipo,
      documento: c.documento.numero,
      created_at: agora,
      updated_at: agora,
    };
    this.clientes.push(row);
    return row;
  }
  async atualizarCliente(id: string, patch: Record<string, unknown>) {
    const c = this.clientes.find((x) => x.id === id)!;
    const { documento, ...resto } = patch as { documento?: Documento };
    Object.assign(c, resto, documento ? { documento_tipo: documento.tipo, documento: documento.numero } : {});
    return c;
  }
  async adicionarApelido(id: string, apelido: string) {
    const c = this.clientes.find((x) => x.id === id);
    if (c && !c.apelidos.includes(apelido) && c.nome !== apelido) c.apelidos.push(apelido);
  }
  async criarSessao(userId: number, estado: string, payload: unknown) {
    const id = `s${++this.seq}`;
    this.sessoes.set(id, { id, telegramUserId: userId, estado, payload, expiraEm: '', criada: this.seq });
    return id;
  }
  async obterSessao(id: string) {
    return this.sessoes.get(id) ?? null;
  }
  async sessaoAtiva(userId: number, estados: string[]) {
    const lista = [...this.sessoes.values()].filter((s) => s.telegramUserId === userId && estados.includes(s.estado));
    return lista.sort((a, b) => b.criada - a.criada)[0] ?? null;
  }
  async atualizarSessao(id: string, estado: string, payload: unknown) {
    const s = this.sessoes.get(id);
    if (s) Object.assign(s, { estado, payload });
  }
  async consumirSessao(id: string) {
    return this.sessoes.delete(id);
  }
}

/** Simula o modelo: devolve a extração esperada para cada texto e registra o contexto recebido. */
class IAFake implements Interpretador {
  chamadas: { texto: string; ctx: ContextoInterpretacao }[] = [];
  constructor(private readonly respostas: Record<string, IntencaoParcial>) {}
  async interpretar(texto: string, ctx: ContextoInterpretacao): Promise<ResultadoInterpretacao> {
    this.chamadas.push({ texto, ctx });
    return this.respostas[texto] ?? { tipo: 'falha', motivo: 'sem resposta' };
  }
}

const botao = (r: Resposta[], prefixo: string) => r.flatMap((x) => x.teclado ?? []).flat().find((b) => b.dados.startsWith(prefixo));
const textos = (r: Resposta[]) => r.map((x) => x.texto).join('\n---\n');
const U = 771585420;

describe('conversa do print: cadastro → empréstimo incompleto', () => {
  const repo = new RepoMemoria();
  const ia = new IAFake({
    cadastro: PARCIAIS[1]!.esperado,
    'pedro miquiles 52998224725': { tipo: 'criar_cliente', dados: { nome: 'Pedro Miquiles', apelidos: [], telefone: null, documento: '52998224725' } },
    '1000 para receber dia 20/11/2026': PARCIAIS[0]!.esperado,
  });
  const app = new Aplicacao(repo as unknown as Repositorio, ia, { info: () => {}, error: (e) => console.error(e) });

  it('"cadastro" pede o nome (não esquece a intenção)', async () => {
    const r = await app.mensagem(U, 'cadastro');
    expect(textos(r)).toContain('Qual o nome completo do cliente?');
  });

  it('nome + documento na mesma mensagem: completa o rascunho e pede confirmação', async () => {
    const r = await app.mensagem(U, 'pedro miquiles 52998224725');
    // A IA recebeu o rascunho e o que foi perguntado
    expect(ia.chamadas.at(-1)!.ctx.rascunho?.tipo).toBe('criar_cliente');
    expect(ia.chamadas.at(-1)!.ctx.aguardando).toContain('nome completo');
    expect(textos(r)).toContain('Novo cliente');
    expect(textos(r)).toContain('529.982.247-25');
    const r2 = await app.callback(U, botao(r, 'ok:')!.dados);
    expect(textos(r2)).toContain('Cadastrado');
    expect(repo.clientes).toHaveLength(1);
  });

  it('"1000 para receber dia 20/11/2026": pergunta o cliente oferecendo o último', async () => {
    const r = await app.mensagem(U, '1000 para receber dia 20/11/2026');
    expect(textos(r)).toContain('recebe R$');
    expect(textos(r)).toContain('Para quem é o empréstimo?');
    const uc = botao(r, 'uc:')!;
    expect(uc.texto).toBe('👤 Pedro Miquiles');

    const r2 = await app.callback(U, uc.dados);
    expect(textos(r2)).toContain('Quanto você emprestou?');
  });

  it('emprestado maior que o total: avisa e pergunta de novo o que acabou de ser digitado', async () => {
    const r = await app.mensagem(U, '1.200');
    expect(textos(r)).toContain('não pode ser menor');
    expect(textos(r)).toContain('Quanto você emprestou?');
    expect(textos(r)).toContain('recebe R$'); // o total (1000) foi mantido
  });

  it('resposta curta completa sem IA e chega ao resumo com juros e taxa', async () => {
    const antes = ia.chamadas.length;
    const r = await app.mensagem(U, '800');
    expect(ia.chamadas.length).toBe(antes); // "800" foi lido direto, sem IA
    const resumo = textos(r);
    expect(resumo).toContain('Novo empréstimo');
    expect(resumo).toContain('Pedro Miquiles');
    expect(resumo).toContain('Emprestado: <b>R$ 800,00</b>');
    expect(resumo).toContain('A receber: <b>R$ 1.000,00</b> (juros R$ 200,00)');
    expect(resumo).toMatch(/Vencimento: <b>20\/11/);
    expect(resumo).toMatch(/a\.m\./);
    expect(botao(r, 'ok:')).toBeDefined();
  });
});

describe('conversa: tudo numa frase só vai direto ao resumo', () => {
  it('sem perguntas extras', async () => {
    const repo = new RepoMemoria();
    await repo.criarCliente({ nome: 'Carlos Souza', documento: { tipo: 'cpf', numero: '52998224725' } });
    const ia = new IAFake({
      x: {
        tipo: 'criar_operacao',
        dados: { cliente: 'Carlos Souza', documento: null, valor_emprestado: 2000, valor_total_receber: 2400, numero_parcelas: null, periodicidade: null, primeiro_vencimento: '2026-12-15', data_emprestimo: null, observacoes: null },
      },
    });
    const app = new Aplicacao(repo as unknown as Repositorio, ia, { info: () => {}, error: (e) => console.error(e) });
    const r = await app.mensagem(U, 'x');
    expect(textos(r)).toContain('Novo empréstimo');
    expect(textos(r)).toContain('juros R$ 400,00');
    expect(textos(r)).toMatch(/a\.m\./);
  });
});

describe('documento repetido com outro nome e /editar', () => {
  const repo = new RepoMemoria();
  const ia = new IAFake({
    'vania 68826079404': { tipo: 'criar_cliente', dados: { nome: 'Vania', apelidos: [], telefone: null, documento: '68826079404' } },
    'renomeia o joao para Vânia Souza': { tipo: 'editar_cliente', dados: { cliente: 'joao', campo: 'nome', valor: 'Vânia Souza' } },
  });
  const app = new Aplicacao(repo as unknown as Repositorio, ia, { info: () => {}, error: (e) => console.error(e) });

  it('o caso relatado: não vira apelido; oferece editar o cadastro', async () => {
    await repo.criarCliente({ nome: 'joao', documento: { tipo: 'cpf', numero: '68826079404' } });
    await app.mensagem(U, 'cadastro');
    const r = await app.mensagem(U, 'vania 68826079404');
    expect(textos(r)).toContain('688.260.794-04 já é de <b>joao</b>');
    expect(textos(r)).toContain('Se o nome certo é "Vania"');
    expect(botao(r, 'cd:')).toBeUndefined(); // cadastro: não há "usar" (o cliente já existe)
    expect(botao(r, 'em:')!.texto).toBe('✏️ Editar cadastro');
    expect(repo.clientes[0]!.apelidos).toEqual([]);

    // Editar cadastro → Nome → "Vania" → confirmação antes/depois → atualizado
    const menu = await app.callback(U, botao(r, 'em:')!.dados);
    expect(textos(menu)).toContain('Editar cadastro');
    const pede = await app.callback(U, botao(menu, 'ec:')!.dados); // primeiro botão: Nome
    expect(textos(pede)).toContain('nome completo correto');
    const conf = await app.mensagem(U, 'Vania');
    expect(textos(conf)).toContain('Nome: joao → <b>Vania</b>');
    const ok = await app.callback(U, botao(conf, 'ok:')!.dados);
    expect(textos(ok)).toContain('Atualizado');
    expect(repo.clientes[0]!.nome).toBe('Vania');
  });

  it('/editar por documento; apelidos e telefone; valores inválidos são re-perguntados', async () => {
    const menu = await app.comando(U, 'editar', '688.260.794-04');
    expect(textos(menu)).toContain('Nome: <b>Vania</b>');
    const ap = await app.callback(U, `ec:${repo.clientes[0]!.id}:apelidos`);
    expect(textos(ap)).toContain('separados por vírgula');
    const c1 = await app.mensagem(U, 'Vaninha, Vani, Vaninha');
    expect(textos(c1)).toContain('Apelidos: — → <b>Vaninha, Vani</b>');
    await app.callback(U, botao(c1, 'ok:')!.dados);
    expect(repo.clientes[0]!.apelidos).toEqual(['Vaninha', 'Vani']);

    await app.callback(U, `ec:${repo.clientes[0]!.id}:telefone`);
    const inval = await app.mensagem(U, '12');
    expect(textos(inval)).toContain('Telefone inválido');
    const c2 = await app.mensagem(U, '+55 81 99999-0000');
    await app.callback(U, botao(c2, 'ok:')!.dados);
    expect(repo.clientes[0]!.telefone).toBe('+55 81 99999-0000');

    await app.callback(U, `ec:${repo.clientes[0]!.id}:apelidos`);
    const c3 = await app.mensagem(U, 'nenhum');
    await app.callback(U, botao(c3, 'ok:')!.dados);
    expect(repo.clientes[0]!.apelidos).toEqual([]);
  });

  it('documento de outro cliente é recusado; mesmo valor não gera confirmação', async () => {
    await repo.criarCliente({ nome: 'Pedro', documento: { tipo: 'cpf', numero: '11219819417' } });
    await app.callback(U, `ec:${repo.clientes[0]!.id}:documento`);
    expect(textos(await app.mensagem(U, '112.198.194-17'))).toContain('já é de <b>Pedro</b>');
    await app.callback(U, `ec:${repo.clientes[0]!.id}:nome`);
    expect(textos(await app.mensagem(U, 'Vania'))).toContain('Nada mudou');
  });

  it('em linguagem natural vai direto para a confirmação', async () => {
    repo.clientes[0]!.nome = 'joao';
    const r = await app.mensagem(U, 'renomeia o joao para Vânia Souza');
    expect(textos(r)).toContain('Nome: joao → <b>Vânia Souza</b>');
  });

  it('"/editar" sem nome pergunta o cliente', async () => {
    expect(textos(await app.comando(U, 'editar', ''))).toContain('Qual cliente você quer editar?');
    expect(textos(await app.mensagem(U, 'Pedro'))).toContain('Editar cadastro');
  });
});

describe('pagamento guiado: quem paga → qual contrato → quanto', () => {
  const agora = '2026-10-20T00:00:00Z';
  const op = (id: string, cliente: string, data: string, principal: number, total: number): OperacaoRow => ({
    id, cliente_id: cliente, data_emprestimo: data, valor_principal: principal, valor_total_receber: total, juros_total: total - principal,
    taxa_periodo: 0.3, taxa_efetiva_mensal: 0.1, tipo: 'parcelada', periodicidade: 'mensal', status: 'ativa', renegociacoes: 0, valor_prejuizo: 0,
    perdida_em: null, cancelado_em: null, observacoes: null, origem: 'telegram', mensagem_origem_id: null, created_at: agora, updated_at: agora,
  });
  const par = (id: string, opId: string, numero: number, venc: string, valor: number, principal: number): ParcelaRow => ({
    id, operacao_id: opId, numero, vencimento: venc, valor, valor_principal: principal, valor_juros: valor - principal,
    valor_pago: 0, principal_pago: 0, juros_pago: 0, status: 'aberta', cancelado_em: null, created_at: agora, updated_at: agora,
  });

  async function montar() {
    const repo = new RepoMemoria();
    const pedro = await repo.criarCliente({ nome: 'Pedro', documento: { tipo: 'cpf', numero: '11219819417' } });
    const ana = await repo.criarCliente({ nome: 'Ana Paula', documento: { tipo: 'cpf', numero: '52998224725' } });
    repo.operacoes.push(op('o1', pedro.id, '2026-09-01', 100000, 130000), op('o2', pedro.id, '2026-10-10', 50000, 60000), op('o3', ana.id, '2026-10-01', 80000, 100000));
    repo.parcelas.push(
      par('p1', 'o1', 1, '2026-10-01', 65000, 50000), // atrasada
      par('p2', 'o1', 2, '2026-11-01', 65000, 50000),
      par('p3', 'o2', 1, '2026-11-10', 60000, 50000),
      par('p4', 'o3', 1, '2026-11-20', 100000, 80000),
    );
    const ia = new IAFake({ 'ana pagou 300': { tipo: 'registrar_pagamento', dados: { cliente: 'Ana Paula', valor: 300, data: null, forma: 'pix' } } });
    return { repo, app: new Aplicacao(repo as unknown as Repositorio, ia, { info: () => {}, error: (e) => console.error(e) }) };
  }

  it('/pagar lista os devedores (atrasados primeiro) e os contratos do escolhido', async () => {
    const { app } = await montar();
    const r1 = await app.comando(U, 'pagar', '');
    expect(textos(r1)).toContain('Quem está pagando?');
    const rotulos = r1[0]!.teclado!.flat().map((b) => b.texto);
    expect(rotulos[0]).toBe('🔴 Pedro · R$ 1.900,00');
    expect(rotulos[1]).toBe('Ana Paula · R$ 1.000,00');

    const r2 = await app.callback(U, botao(r1, 'pc:')!.dados); // Pedro
    expect(textos(r2)).toContain('<b>Pedro</b> tem 2 contratos em aberto');
    expect(textos(r2)).toContain('🔴 venceu 01/10');
    expect(textos(r2)).toContain('em aberto <b>R$ 1.300,00</b>');

    const r3 = await app.callback(U, botao(r2, 'po:')!.dados); // contrato 1 (o1)
    expect(textos(r3)).toContain('Quanto foi pago?');
    const opcoes = r3.flatMap((x) => x.teclado ?? []).flat().map((b) => b.texto);
    expect(opcoes).toEqual(expect.arrayContaining(['Parcela atual · R$ 650,00', 'Quitar contrato · R$ 1.300,00']));

    const quitar = r3.flatMap((x) => x.teclado ?? []).flat().find((b) => b.texto.startsWith('Quitar'))!;
    const r4 = await app.callback(U, quitar.dados);
    expect(textos(r4)).toContain('Pagamento recebido');
    expect(textos(r4)).toContain('Valor: <b>R$ 1.300,00</b>');
    expect(textos(r4)).toContain('parcela 1');
    expect(textos(r4)).toContain('parcela 2');
    expect(botao(r4, 'ok:')).toBeDefined();
  });

  it('digitar o nome e depois o valor também funciona', async () => {
    const { app } = await montar();
    await app.comando(U, 'pagar', '');
    const r1 = await app.mensagem(U, '112.198.194-17'); // pelo documento
    expect(textos(r1)).toContain('tem 2 contratos');
    const r2 = await app.callback(U, r1[0]!.teclado![1]![0]!.dados); // contrato 2 (o2)
    const r3 = await app.mensagem(U, '200');
    expect(textos(r3)).toContain('Valor: <b>R$ 200,00</b>');
    expect(r2).toBeDefined();
  });

  it('frase com cliente de um contrato só vai direto ao resumo; valor acima do contrato é recusado', async () => {
    const { app } = await montar();
    const r = await app.mensagem(U, 'ana pagou 300');
    expect(textos(r)).toContain('Pagamento recebido');
    expect(textos(r)).toContain('Ana Paula');
    expect(textos(await app.comando(U, 'pagar', 'Ana 5000'))).toContain('mais que o saldo em aberto deste contrato');
  });

  it('/pagar Pedro (sem valor) mostra os contratos; ninguém devendo', async () => {
    const { app, repo } = await montar();
    expect(textos(await app.comando(U, 'pagar', 'Pedro'))).toContain('tem 2 contratos');
    repo.parcelas.length = 0;
    expect(textos(await app.comando(U, 'pagar', ''))).toContain('Ninguém está devendo');
  });
});
