import { CONFIG_PADRAO, type ClienteRow, type Repositorio, type SessaoBot } from '@cobra/db';
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
  private seq = 0;
  readonly db = null;
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
