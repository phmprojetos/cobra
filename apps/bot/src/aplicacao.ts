import {
  AJUDA_DOCUMENTO,
  ErroRegra,
  formatarDocumento,
  parseDocumento,
  type Documento,
  inicioSemana,
  metricasCliente,
  parseDataCurta,
  parseValor,
  resolverCliente,
  saldoParcela,
  somarDias,
  somarMeses,
  type Centavos,
  type DataISO,
} from '@cobra/core';
import {
  ErroBanco,
  executarOperacao,
  executarPagamento,
  executarRenegociacao,
  paraParcela,
  parcelasEmAbertoDoCliente,
  planejarOperacao,
  planejarPagamento,
  planejarRenegociacao,
  type ClienteRow,
  type MetaLancamento,
  type PlanoOperacao,
  type PlanoPagamento,
  type PlanoRenegociacao,
  type Repositorio,
} from '@cobra/db';
import { intencaoRapida, parseNovo, parsePagar } from './atalhos';
import {
  textoAReceber,
  textoAtrasados,
  textoCliente,
  textoResumoCarteira,
  textoResumoDiario,
} from './consultas';
import { BOTOES_CONFIRMACAO, escapar, Formatador, TEXTO_AJUDA, type Botao, type Resposta } from './formatacao';
import type { Intencao } from './ia/ferramentas';
import type { Interpretador, ResultadoInterpretacao } from './ia/interpretador';
import {
  campoFaltante,
  completar,
  ehRascunho,
  mesclar,
  pergunta,
  preencherDireto,
  problema,
  resumoParcial,
  type Campo,
  type Rascunho,
} from './rascunho';

type Pendente =
  | { acao: 'operacao'; plano: PlanoOperacao; intencao: Intencao; texto: string }
  | { acao: 'pagamento'; plano: PlanoPagamento; intencao: Intencao | null; texto: string }
  | { acao: 'renegociacao'; plano: PlanoRenegociacao; intencao: Intencao | null; texto: string }
  | {
      acao: 'cliente';
      dados: { nome: string; apelidos: string[]; telefone: string | null; documento: Documento };
      intencao: Intencao;
      texto: string;
    };

interface EscolhaCliente {
  intencao: Intencao;
  texto: string;
  nomeDigitado: string;
  opcoes: { id: string; nome: string }[];
}

/** Aguardando o documento para cadastrar um cliente novo (e então seguir a intenção). */
interface CadastroPendente {
  intencao: Intencao;
  texto: string;
  nome: string;
  /** Cliente que já tem o documento informado (confirmação "é a mesma pessoa?"). */
  existenteId?: string;
}

/** Lançamento incompleto aguardando o próximo dado. */
interface SessaoRascunho {
  rascunho: Rascunho;
  /** Mensagens que compuseram o lançamento (vai para a auditoria). */
  texto: string;
  campo: Campo;
}

interface EscolhaParcela {
  intencao: Extract<Intencao, { tipo: 'prorrogar' }>;
  texto: string;
  opcoes: string[];
}

/** Estados em que a próxima mensagem de texto é a resposta a uma pergunta do bot. */
const ESTADOS_TEXTO = [
  'aguardando_edicao',
  'aguardando_valor_parcial',
  'aguardando_data_adiar',
  'aguardando_novo',
  'aguardando_pagar',
  'aguardando_documento',
  'rascunho',
];

const centavos = (reais: number): Centavos => Math.round(reais * 100);

/** "Ana Paula · CPF …4725": distingue homônimos sem expor o documento inteiro. */
function rotuloCliente(c: { nome: string; documento_tipo?: string | null; documento?: string | null }): string {
  return c.documento ? `${c.nome} · ${(c.documento_tipo ?? '').toUpperCase()} …${c.documento.slice(-4)}` : c.nome;
}

export interface Log {
  info(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

/**
 * Regras de conversa do bot, independentes do Telegram: recebe texto/comandos/cliques
 * e devolve respostas (texto HTML + botões). O adaptador grammY só renderiza.
 */
export class Aplicacao {
  constructor(
    private readonly repo: Repositorio,
    private readonly ia: Interpretador,
    private readonly log: Log = console,
  ) {}

  private async fmt(): Promise<Formatador> {
    return new Formatador(await this.repo.configuracao());
  }

  // ─────────────────────────── entradas ───────────────────────────

  async mensagem(userId: number, texto: string): Promise<Resposta[]> {
    return this.protegido(async () => {
      const espera = await this.repo.sessaoAtiva(userId, ESTADOS_TEXTO);
      if (espera?.estado === 'rascunho') {
        return this.continuarRascunho(userId, espera.id, espera.payload as SessaoRascunho, texto);
      }
      if (espera) {
        const r = await this.responderEspera(userId, espera.id, espera.estado, espera.payload, texto);
        if (r) return r;
      }
      const rapida = intencaoRapida(texto);
      if (rapida) return this.processar(userId, rapida, texto);
      const hoje = await this.repo.hoje();
      const clientes = await this.repo.listarClientes();
      const intencao = await this.ia.interpretar(texto, {
        hoje,
        timezone: (await this.repo.configuracao()).timezone,
        clientes,
      });
      return this.processar(userId, intencao, texto);
    });
  }

  async comando(userId: number, nome: string, args: string): Promise<Resposta[]> {
    return this.protegido(async () => {
      await this.limparEsperas(userId);
      const hoje = await this.repo.hoje();
      const f = await this.fmt();
      switch (nome) {
        case 'start':
        case 'ajuda':
          return [{ texto: TEXTO_AJUDA }];
        case 'novo':
        case 'pagar': {
          if (!args.trim()) {
            await this.repo.criarSessao(userId, nome === 'novo' ? 'aguardando_novo' : 'aguardando_pagar', {});
            return [
              {
                texto:
                  nome === 'novo'
                    ? 'Envie: <code>nome valor total vencimento [4x] [semanal|quinzenal|mensal]</code>\nEx.: <code>Carlos 2000 2400 15/12</code>'
                    : 'Envie: <code>nome valor [data]</code>\nEx.: <code>Carlos 1200</code>',
              },
            ];
          }
          const r = nome === 'novo' ? parseNovo(args, hoje) : parsePagar(args, hoje);
          return 'erro' in r ? [{ texto: r.erro }] : this.processar(userId, r, `/${nome} ${args}`);
        }
        case 'hoje': {
          const c = await this.repo.carregarCarteira();
          return [{ texto: textoResumoDiario(c, hoje, f) }];
        }
        case 'semana': {
          const c = await this.repo.carregarCarteira();
          const seg = inicioSemana(hoje);
          return [{ texto: textoAReceber(c, { inicio: seg, fim: somarDias(seg, 6) }, hoje, f) }];
        }
        case 'atrasados':
          return [{ texto: textoAtrasados(await this.repo.carregarCarteira(), hoje, f) }];
        case 'resumo':
          return [{ texto: textoResumoCarteira(await this.repo.carregarCarteira(), hoje, f) }];
        case 'cliente':
          if (!args.trim()) return [{ texto: 'Uso: /cliente <code>nome</code>' }];
          return this.processar(userId, { tipo: 'consultar', dados: { tipo: 'saldo_cliente', cliente: args.trim(), data_inicio: null, data_fim: null } }, `/cliente ${args}`);
        default:
          return [{ texto: 'Comando desconhecido. Veja /ajuda.' }];
      }
    });
  }

  async callback(userId: number, dados: string): Promise<Resposta[]> {
    return this.protegido(async () => {
      const [acao, id, extra] = dados.split(':');
      if (!acao || !id) return [];
      switch (acao) {
        case 'ok':
          return this.confirmar(id);
        case 'x':
          await this.repo.consumirSessao(id);
          return [{ texto: '❌ Cancelado. Nada foi gravado.', editarOriginal: true }];
        case 'ed':
          return this.editar(id);
        case 'cl':
          return this.escolherCliente(userId, id, extra ?? '');
        case 'cd':
          return this.confirmarMesmoCliente(userId, id);
        case 'uc':
          return this.usarUltimoCliente(userId, id);
        case 'pa':
          return this.escolherParcela(userId, id, Number(extra));
        // Botões dos alertas de parcela
        case 'rt':
          return this.recebidoTotal(userId, id);
        case 'rp':
          await this.repo.criarSessao(userId, 'aguardando_valor_parcial', { parcelaId: id });
          return [{ texto: '🪙 Quanto foi recebido? (só o valor, ex.: <code>150</code>)' }];
        case 'ad':
          return this.adiar(userId, id, Number(extra));
        case 'al':
          await this.repo.criarSessao(userId, 'aguardando_data_adiar', { parcelaId: id });
          return [{ texto: '📅 Para qual data? (ex.: <code>30/11</code> ou <code>dia 5</code>)' }];
        default:
          return [];
      }
    });
  }

  // ─────────────────────────── intenções ───────────────────────────

  async processar(userId: number, r: ResultadoInterpretacao, texto: string): Promise<Resposta[]> {
    switch (r.tipo) {
      case 'falha':
        this.log.info({ motivo: r.motivo }, 'interpretação falhou');
        return [{ texto: 'Não consegui entender. 🤔 Pode reformular? Exemplos em /ajuda.' }];
      case 'pedir_esclarecimento':
        return [{ texto: escapar(r.dados.pergunta) }];
      case 'consultar':
        return this.consultar(r);
      default:
        return this.avancarRascunho(userId, r, texto);
    }
  }

  // ─────────────────────────── rascunho (coleta campo a campo) ───────────────────────────

  /**
   * Verifica o que falta no lançamento: pergunta UM campo por vez (guardando o rascunho)
   * ou, completo, segue para cliente → plano → confirmação.
   */
  private async avancarRascunho(userId: number, r: Rascunho, texto: string, aviso: string | null = null, recente: Campo | null = null): Promise<Resposta[]> {
    const hoje = await this.repo.hoje();
    const prob = problema(r, hoje, recente);
    if (prob) {
      const limpo = { ...r, dados: { ...r.dados, [prob.campo]: null } } as Rascunho;
      return this.avancarRascunho(userId, limpo, texto, prob.mensagem);
    }
    const falta = campoFaltante(r);
    if (!falta) return this.executarIntencao(userId, completar(r, hoje)!, texto);

    const sessao: SessaoRascunho = { rascunho: r, texto, campo: falta };
    const sid = await this.repo.criarSessao(userId, 'rascunho', sessao, 60);
    const f = await this.fmt();
    const teclado: Botao[][] = [];
    if (falta === 'cliente') {
      const ultimo = await this.ultimoCliente(userId);
      if (ultimo) teclado.push([{ texto: `👤 ${ultimo.nome}`, dados: `uc:${sid}` }]);
    }
    teclado.push([{ texto: '❌ Cancelar', dados: `x:${sid}` }]);
    const reais = (v: number) => f.dinheiro(Math.round(v * 100));
    return [
      {
        texto: [
          ...(aviso ? [`⚠️ ${aviso}`] : []),
          resumoParcial(r, reais, (d) => f.data(d, hoje.slice(0, 4))),
          '',
          pergunta(falta, r),
        ].join('\n'),
        teclado,
      },
    ];
  }

  /** Próxima mensagem com um rascunho aberto: tenta ler o dado direto; senão a IA completa o rascunho. */
  private async continuarRascunho(userId: number, sid: string, s: SessaoRascunho, texto: string): Promise<Resposta[]> {
    await this.repo.consumirSessao(sid);
    const hoje = await this.repo.hoje();
    const historico = `${s.texto}\n${texto}`;
    const direto = preencherDireto(s.rascunho, s.campo, texto, hoje);
    if (direto) return this.avancarRascunho(userId, direto, historico, null, s.campo);

    const res = await this.ia.interpretar(texto, {
      hoje,
      timezone: (await this.repo.configuracao()).timezone,
      clientes: await this.repo.listarClientes(),
      rascunho: s.rascunho,
      aguardando: pergunta(s.campo, s.rascunho).replace(/<[^>]+>/g, ''),
    });
    if (res.tipo === s.rascunho.tipo && ehRascunho(res)) return this.avancarRascunho(userId, mesclar(s.rascunho, res), historico, null, s.campo);
    if (res.tipo === 'consultar' || res.tipo === 'falha' || res.tipo === 'pedir_esclarecimento') {
      // Não abandona o lançamento: responde e repete a pergunta pendente.
      const antes = res.tipo === 'consultar' ? await this.consultar(res) : res.tipo === 'pedir_esclarecimento' ? [{ texto: escapar(res.dados.pergunta) }] : [{ texto: 'Não entendi. 🤔' }];
      const depois = await this.avancarRascunho(userId, s.rascunho, s.texto);
      return [...antes, ...depois];
    }
    // Mudou de assunto (outro lançamento): o rascunho anterior é descartado.
    return this.processar(userId, res, texto);
  }

  private async usarUltimoCliente(userId: number, sid: string): Promise<Resposta[]> {
    const sessao = await this.repo.obterSessao(sid);
    const ultimo = await this.ultimoCliente(userId);
    if (!sessao || sessao.estado !== 'rascunho' || !ultimo || !(await this.repo.consumirSessao(sid))) {
      return [{ texto: '⌛ Esta pergunta expirou. Envie a mensagem de novo.', editarOriginal: true }];
    }
    const s = sessao.payload as SessaoRascunho;
    const r = { ...s.rascunho, dados: { ...s.rascunho.dados, cliente: ultimo.nome } } as Rascunho;
    return [{ texto: `👤 ${escapar(ultimo.nome)}`, editarOriginal: true }, ...(await this.avancarRascunho(userId, r, s.texto))];
  }

  /** Último cliente com quem o usuário lidou (para "é para ele?" quando o nome não vem). */
  private async ultimoCliente(userId: number): Promise<{ id: string; nome: string } | null> {
    const s = await this.repo.sessaoAtiva(userId, ['ultimo_cliente']);
    return (s?.payload as { id: string; nome: string } | undefined) ?? null;
  }

  private async lembrarCliente(userId: number, c: { id: string; nome: string }): Promise<void> {
    await this.repo.criarSessao(userId, 'ultimo_cliente', { id: c.id, nome: c.nome }, 120);
  }

  /** Intenção completa: resolve/cadastra o cliente e monta o plano para confirmação. */
  private async executarIntencao(userId: number, r: Intencao, texto: string): Promise<Resposta[]> {
    switch (r.tipo) {
      case 'criar_cliente': {
        const nome = r.dados.nome!.trim();
        const doc = r.dados.documento ? parseDocumento(r.dados.documento) : null;
        if (!doc || 'erro' in doc) return this.pedirDocumento(userId, r, texto, nome, doc && 'erro' in doc ? doc.erro : null);
        return this.cadastrarComDocumento(userId, { intencao: r, texto, nome }, doc);
      }
      case 'criar_operacao': {
        // Documento informado junto: ele manda (mesmo cliente com outro nome não duplica).
        const doc = r.dados.documento ? parseDocumento(r.dados.documento) : null;
        if (doc && !('erro' in doc)) {
          const existente = await this.repo.clientePorDocumento(doc);
          if (existente) {
            await this.repo.adicionarApelido(existente.id, r.dados.cliente);
            return this.continuarComCliente(userId, r, texto, existente);
          }
          const res = resolverCliente(r.dados.cliente, await this.repo.listarClientes());
          if (res.tipo !== 'unico') return this.cadastrarComDocumento(userId, { intencao: r, texto, nome: r.dados.cliente }, doc);
        }
        return this.comCliente(userId, r, texto, r.dados.cliente, true);
      }
      case 'registrar_pagamento':
      case 'prorrogar':
        return this.comCliente(userId, r, texto, r.dados.cliente, false);
      default:
        return this.processar(userId, r, texto);
    }
  }

  /** Resolve o cliente sem chutar; se ambíguo/inexistente, pergunta com botões. */
  private async comCliente(userId: number, intencao: Intencao, texto: string, nome: string, permitirNovo: boolean): Promise<Resposta[]> {
    const clientes = await this.repo.listarClientes();
    const r = resolverCliente(nome, clientes);
    if (r.tipo === 'unico') return this.continuarComCliente(userId, intencao, texto, r.cliente);

    let opcoes: { id: string; nome: string }[] = r.tipo === 'ambiguo' ? r.opcoes : [];
    if (opcoes.length === 0) {
      opcoes = (await this.repo.buscarClientes(nome, 4)).filter((c) => c.similaridade >= 0.25);
    }
    opcoes = opcoes.slice(0, 5).map((c) => ({ id: c.id, nome: rotuloCliente(c) }));
    if (opcoes.length === 0 && !permitirNovo) {
      return [{ texto: `Não encontrei nenhum cliente parecido com <b>${escapar(nome)}</b>.` }];
    }
    if (opcoes.length === 0) return this.pedirDocumento(userId, intencao, texto, nome, null);
    const payload: EscolhaCliente = { intencao, texto, nomeDigitado: nome, opcoes };
    const sid = await this.repo.criarSessao(userId, 'escolher_cliente', payload);
    const teclado: Botao[][] = opcoes.map((o, i) => [{ texto: o.nome, dados: `cl:${sid}:${i}` }]);
    if (permitirNovo) teclado.push([{ texto: `➕ É outra pessoa: cadastrar "${nome}"`, dados: `cl:${sid}:n` }]);
    teclado.push([{ texto: '❌ Cancelar', dados: `x:${sid}` }]);
    const pergunta =
      r.tipo === 'ambiguo'
        ? `Qual <b>${escapar(nome)}</b>?`
        : opcoes.length
          ? `Não achei <b>${escapar(nome)}</b>. Era um destes?`
          : `<b>${escapar(nome)}</b> não está cadastrado.`;
    return [{ texto: pergunta, teclado }];
  }

  // ─────────────────────────── cadastro com documento ───────────────────────────

  /** Pergunta o documento: nome + documento são obrigatórios e o documento evita duplicidade. */
  private async pedirDocumento(userId: number, intencao: Intencao, texto: string, nome: string, erro: string | null): Promise<Resposta[]> {
    const payload: CadastroPendente = { intencao, texto, nome };
    const sid = await this.repo.criarSessao(userId, 'aguardando_documento', payload);
    return [
      {
        texto: [
          ...(erro ? [`⚠️ ${erro}`] : []),
          `👤 Para cadastrar <b>${escapar(nome)}</b>, qual o documento?`,
          AJUDA_DOCUMENTO,
        ].join('\n'),
        teclado: [[{ texto: '❌ Cancelar', dados: `x:${sid}` }]],
      },
    ];
  }

  /**
   * Com o documento em mãos: se já existe cliente com ele, pergunta se é a mesma pessoa
   * (evita duplicar quando o nome veio diferente); senão cadastra e segue o lançamento.
   */
  private async cadastrarComDocumento(userId: number, c: CadastroPendente, doc: Documento): Promise<Resposta[]> {
    const existente = await this.repo.clientePorDocumento(doc);
    if (existente) {
      const sid = await this.repo.criarSessao(userId, 'confirmar_documento', { ...c, existenteId: existente.id } satisfies CadastroPendente);
      return [
        {
          texto: `🔎 ${formatarDocumento(doc.tipo, doc.numero)} já é de <b>${escapar(existente.nome)}</b>. É a mesma pessoa?`,
          teclado: [
            [{ texto: `✅ Sim, usar ${existente.nome}`, dados: `cd:${sid}` }],
            [{ texto: '❌ Cancelar', dados: `x:${sid}` }],
          ],
        },
      ];
    }
    if (c.intencao.tipo === 'criar_cliente') {
      const d = c.intencao.dados;
      return this.pedirConfirmacao(userId, {
        acao: 'cliente',
        dados: { nome: c.nome, apelidos: d.apelidos, telefone: d.telefone, documento: doc },
        intencao: c.intencao,
        texto: c.texto,
      });
    }
    const novo = await this.repo.criarCliente({ nome: c.nome, documento: doc });
    const r = await this.continuarComCliente(userId, c.intencao, c.texto, novo);
    return [{ texto: `👤 <b>${escapar(novo.nome)}</b> cadastrado · ${formatarDocumento(doc.tipo, doc.numero)}` }, ...r];
  }

  private async confirmarMesmoCliente(userId: number, sessaoId: string): Promise<Resposta[]> {
    const sessao = await this.repo.obterSessao(sessaoId);
    if (!sessao || sessao.estado !== 'confirmar_documento' || !(await this.repo.consumirSessao(sessaoId))) {
      return [{ texto: '⌛ Esta pergunta expirou. Envie a mensagem de novo.', editarOriginal: true }];
    }
    const p = sessao.payload as CadastroPendente;
    const cliente = p.existenteId ? await this.repo.cliente(p.existenteId) : null;
    if (!cliente) return [];
    // O nome usado no lançamento vira apelido: da próxima vez o bot reconhece direto.
    await this.repo.adicionarApelido(cliente.id, p.nome);
    if (p.intencao.tipo === 'criar_cliente') {
      return [{ texto: `👤 <b>${escapar(cliente.nome)}</b> já está cadastrado. Guardei "${escapar(p.nome)}" como apelido.`, editarOriginal: true }];
    }
    const r = await this.continuarComCliente(userId, p.intencao, p.texto, cliente);
    return [{ texto: `👤 ${escapar(cliente.nome)} (apelido "${escapar(p.nome)}" guardado)`, editarOriginal: true }, ...r];
  }

  private async continuarComCliente(userId: number, intencao: Intencao, texto: string, cliente: ClienteRow | { id: string; nome: string }): Promise<Resposta[]> {
    await this.lembrarCliente(userId, cliente);
    switch (intencao.tipo) {
      case 'criar_operacao': {
        const d = intencao.dados;
        const plano = await planejarOperacao(this.repo, {
          clienteId: cliente.id,
          dataEmprestimo: d.data_emprestimo,
          principal: centavos(d.valor_emprestado),
          totalReceber: centavos(d.valor_total_receber),
          numeroParcelas: d.numero_parcelas,
          primeiroVencimento: d.primeiro_vencimento,
          periodicidade: d.periodicidade,
          observacoes: d.observacoes,
        });
        return this.pedirConfirmacao(userId, { acao: 'operacao', plano, intencao, texto });
      }
      case 'registrar_pagamento': {
        const d = intencao.dados;
        const plano = await planejarPagamento(this.repo, {
          clienteId: cliente.id,
          valor: centavos(d.valor),
          data: d.data,
          forma: d.forma,
        });
        if (plano.excedente > 0) {
          const f = await this.fmt();
          return [{ texto: `⚠️ ${f.dinheiro(plano.valor)} é mais que o saldo em aberto de <b>${escapar(cliente.nome)}</b> (${f.dinheiro(plano.valor - plano.excedente)}).` }];
        }
        return this.pedirConfirmacao(userId, { acao: 'pagamento', plano, intencao, texto });
      }
      case 'prorrogar': {
        const parcelas = await parcelasEmAbertoDoCliente(this.repo, cliente.id);
        if (parcelas.length === 0) return [{ texto: `${escapar(cliente.nome)} não tem parcelas em aberto.` }];
        const operacoes = new Set(parcelas.map((p) => p.operacaoId));
        if (operacoes.size > 1) {
          // Mais de um empréstimo em aberto: pergunta qual parcela (a próxima de cada um).
          const proximas = [...operacoes].map((op) => parcelas.find((p) => p.operacaoId === op)!);
          const payload: EscolhaParcela = { intencao, texto, opcoes: proximas.map((p) => p.id) };
          const sid = await this.repo.criarSessao(userId, 'escolher_parcela', payload);
          const f = await this.fmt();
          return [
            {
              texto: `${escapar(cliente.nome)} tem ${operacoes.size} empréstimos em aberto. Qual parcela?`,
              teclado: [
                ...proximas.map((p, i) => [{ texto: `${f.data(p.vencimento)} — ${f.dinheiro(saldoParcela(p).total)}`, dados: `pa:${sid}:${i}` }]),
                [{ texto: '❌ Cancelar', dados: `x:${sid}` }],
              ],
            },
          ];
        }
        return this.planejarProrrogacao(userId, intencao, texto, parcelas[0]!.id);
      }
      default:
        return [];
    }
  }

  private async planejarProrrogacao(userId: number, intencao: Extract<Intencao, { tipo: 'prorrogar' }>, texto: string, parcelaId: string): Promise<Resposta[]> {
    const d = intencao.dados;
    const e: { parcelaId: string; novoVencimento?: DataISO; acrescimo?: Centavos } = { parcelaId };
    if (d.novo_vencimento) {
      // "joga pro dia 30": prorrogar nunca antecipa. Se a data resolvida cair antes do vencimento
      // atual, avança mês a mês mantendo o dia (ex.: venc. 15/12 + "dia 30" → 30/12).
      const atual = (await this.saldoDaParcela(parcelaId))?.parcela.vencimento;
      let novo = d.novo_vencimento;
      for (let i = 1; atual && novo < atual && i <= 24; i++) novo = somarMeses(d.novo_vencimento, i);
      e.novoVencimento = novo;
    }
    if (d.acrescimo) e.acrescimo = centavos(d.acrescimo);
    const plano = await planejarRenegociacao(this.repo, e);
    return this.pedirConfirmacao(userId, { acao: 'renegociacao', plano, intencao, texto });
  }

  // ─────────────────────────── confirmação ───────────────────────────

  private async pedirConfirmacao(userId: number, p: Pendente): Promise<Resposta[]> {
    const sid = await this.repo.criarSessao(userId, 'confirmar', p);
    return [{ texto: await this.resumoPendente(p), teclado: BOTOES_CONFIRMACAO(sid) }];
  }

  private async resumoPendente(p: Pendente): Promise<string> {
    const f = await this.fmt();
    const hoje = await this.repo.hoje();
    const ano = hoje.slice(0, 4);
    switch (p.acao) {
      case 'operacao': {
        const { entrada: e, indicadores: i, parcelas } = p.plano;
        return [
          '📝 <b>Novo empréstimo</b>',
          `Cliente: <b>${escapar(p.plano.clienteNome)}</b>`,
          `Emprestado: <b>${f.dinheiro(e.principal)}</b> em ${f.data(e.dataEmprestimo, ano)}`,
          `A receber: <b>${f.dinheiro(e.totalReceber)}</b> (juros ${f.dinheiro(i.jurosTotal)})`,
          parcelas.length > 1 ? `${parcelas.length} parcelas ${e.periodicidade === 'quinzenal' ? 'quinzenais' : e.periodicidade === 'semanal' ? 'semanais' : 'mensais'}:` : '',
          f.parcelas(parcelas, ano),
          `Taxa: ${f.pct(i.taxaPeriodo)} no período · <b>${f.pct(i.taxaEfetivaMensal)} a.m.</b> (${i.prazoDias} dias)`,
          ...(e.observacoes ? [`Obs.: ${escapar(e.observacoes)}`] : []),
        ]
          .filter(Boolean)
          .join('\n');
      }
      case 'pagamento': {
        const pl = p.plano;
        return [
          '💰 <b>Pagamento recebido</b>',
          `Cliente: <b>${escapar(pl.clienteNome)}</b>`,
          `Valor: <b>${f.dinheiro(pl.valor)}</b> em ${f.data(pl.data, ano)}${pl.forma ? ` · ${escapar(pl.forma)}` : ''}`,
          'Abate:',
          ...pl.alocacoes.map(
            (a) =>
              `  • parcela ${a.numero} (venc. ${f.data(a.vencimento, ano)}): ${f.dinheiro(a.valor)} → ${a.quita ? 'quitada ✅' : 'parcial'}\n    principal ${f.dinheiro(a.principal)} · juros ${f.dinheiro(a.juros)}`,
          ),
        ].join('\n');
      }
      case 'renegociacao': {
        const pl = p.plano;
        const { antes, depois, acrescimo } = pl.resultado.evento.payload;
        return [
          `📅 <b>${pl.resultado.alterouValor ? 'Renegociação' : 'Prorrogação'}</b>`,
          `Cliente: <b>${escapar(pl.clienteNome)}</b> · parcela ${pl.numero}/${pl.totalParcelas}`,
          `Vencimento: ${f.data(antes.vencimento, ano)} → <b>${f.data(depois.vencimento, ano)}</b>`,
          `Valor: ${f.dinheiro(antes.valor)} → <b>${f.dinheiro(depois.valor)}</b>${acrescimo ? ` (${acrescimo > 0 ? '+' : ''}${f.dinheiro(acrescimo)})` : ''}`,
          `Nova taxa: ${f.pct(pl.indicadores.taxaEfetivaMensal)} a.m.`,
        ].join('\n');
      }
      case 'cliente':
        return [
          '👤 <b>Novo cliente</b>',
          `Nome: <b>${escapar(p.dados.nome)}</b>`,
          `Documento: ${formatarDocumento(p.dados.documento.tipo, p.dados.documento.numero)}`,
          ...(p.dados.apelidos.length ? [`Apelidos: ${escapar(p.dados.apelidos.join(', '))}`] : []),
          ...(p.dados.telefone ? [`Telefone: ${escapar(p.dados.telefone)}`] : []),
        ].join('\n');
    }
  }

  private async confirmar(sessaoId: string): Promise<Resposta[]> {
    const sessao = await this.repo.obterSessao(sessaoId);
    if (!sessao || sessao.estado !== 'confirmar' || !(await this.repo.consumirSessao(sessaoId))) {
      return [{ texto: '⌛ Este lançamento expirou ou já foi processado.', editarOriginal: true }];
    }
    const p = sessao.payload as Pendente;
    const meta: MetaLancamento = { origem: 'telegram', mensagemTelegram: p.texto };
    const resumo = await this.resumoPendente(p);
    const f = await this.fmt();
    switch (p.acao) {
      case 'operacao':
        await executarOperacao(this.repo, p.plano, meta);
        return [{ texto: `${resumo}\n\n✅ <b>Registrado</b>`, editarOriginal: true }];
      case 'pagamento': {
        await executarPagamento(this.repo, p.plano, meta);
        const c = await this.repo.carregarCarteira({ clienteId: p.plano.clienteId });
        const saldo = metricasCliente(c.carteira, p.plano.clienteId, await this.repo.hoje()).saldoAtual;
        return [{ texto: `${resumo}\n\n✅ <b>Registrado</b> · saldo restante: ${f.dinheiro(saldo)}`, editarOriginal: true }];
      }
      case 'renegociacao':
        await executarRenegociacao(this.repo, p.plano, meta);
        return [{ texto: `${resumo}\n\n✅ <b>Atualizado</b>`, editarOriginal: true }];
      case 'cliente': {
        const novo = await this.repo.criarCliente(p.dados);
        await this.lembrarCliente(sessao.telegramUserId, novo);
        return [
          { texto: `${resumo}\n\n✅ <b>Cadastrado</b>`, editarOriginal: true },
          { texto: `Para lançar um empréstimo para ${escapar(novo.nome)}, mande o valor emprestado, quanto vai receber e quando vence. Ex.: <i>emprestei 1000, volta 1300 dia 20/11</i>` },
        ];
      }
    }
  }

  private async editar(sessaoId: string): Promise<Resposta[]> {
    const sessao = await this.repo.obterSessao(sessaoId);
    if (!sessao || sessao.estado !== 'confirmar') {
      return [{ texto: '⌛ Este lançamento expirou ou já foi processado.', editarOriginal: true }];
    }
    await this.repo.atualizarSessao(sessaoId, 'aguardando_edicao', sessao.payload);
    return [{ texto: '✏️ O que devo corrigir? Ex.: <i>o valor é 2500</i>, <i>vence dia 20</i>, <i>são 5 parcelas</i>.' }];
  }

  // ─────────────────────────── esperas de texto ───────────────────────────

  private async limparEsperas(userId: number): Promise<void> {
    for (;;) {
      const s = await this.repo.sessaoAtiva(userId, ESTADOS_TEXTO);
      if (!s) return;
      await this.repo.consumirSessao(s.id);
    }
  }

  /** Trata a resposta a uma pergunta do bot. Retorna null para seguir a interpretação normal. */
  private async responderEspera(userId: number, sessaoId: string, estado: string, payload: unknown, texto: string): Promise<Resposta[] | null> {
    await this.repo.consumirSessao(sessaoId);
    const hoje = await this.repo.hoje();
    switch (estado) {
      case 'aguardando_edicao': {
        const p = payload as Pendente;
        if (!p.intencao) return [{ texto: 'Este lançamento não pode ser editado por texto. Cancele e lance de novo.' }];
        const r = await this.ia.interpretar(texto, {
          hoje,
          timezone: (await this.repo.configuracao()).timezone,
          clientes: await this.repo.listarClientes(),
          rascunho: p.intencao,
        });
        const corrigida = r.tipo === p.intencao.tipo && ehRascunho(r) && ehRascunho(p.intencao) ? mesclar(p.intencao, r) : r;
        return this.processar(userId, corrigida, `${p.texto}\n[correção] ${texto}`);
      }
      case 'aguardando_valor_parcial': {
        const valor = parseValor(texto);
        if (!valor || valor <= 0) return null;
        const { parcelaId } = payload as { parcelaId: string };
        return this.planejarPagamentoParcela(userId, parcelaId, valor, `Recebido parcial: ${texto}`);
      }
      case 'aguardando_data_adiar': {
        const data = parseDataCurta(texto, hoje);
        if (!data) return null;
        const { parcelaId } = payload as { parcelaId: string };
        return this.planejarAdiamento(userId, parcelaId, data, `Adiar para ${texto}`);
      }
      case 'aguardando_documento': {
        const c = payload as CadastroPendente;
        const doc = parseDocumento(texto);
        if ('erro' in doc) return this.pedirDocumento(userId, c.intencao, c.texto, c.nome, doc.erro);
        return this.cadastrarComDocumento(userId, c, doc);
      }
      case 'aguardando_novo':
      case 'aguardando_pagar': {
        const r = estado === 'aguardando_novo' ? parseNovo(texto, hoje) : parsePagar(texto, hoje);
        return 'erro' in r ? [{ texto: r.erro }] : this.processar(userId, r, texto);
      }
      default:
        return null;
    }
  }

  private async escolherCliente(userId: number, sessaoId: string, escolha: string): Promise<Resposta[]> {
    const sessao = await this.repo.obterSessao(sessaoId);
    if (!sessao || !(await this.repo.consumirSessao(sessaoId))) {
      return [{ texto: '⌛ Esta pergunta expirou. Envie a mensagem de novo.', editarOriginal: true }];
    }
    const p = sessao.payload as EscolhaCliente;
    if (escolha === 'n') {
      const r = await this.pedirDocumento(userId, p.intencao, p.texto, p.nomeDigitado, null);
      return [{ texto: `➕ Novo cliente: <b>${escapar(p.nomeDigitado)}</b>`, editarOriginal: true }, ...r];
    }
    const escolhido = p.opcoes[Number(escolha)];
    const cliente = escolhido && (await this.repo.cliente(escolhido.id));
    if (!cliente) return [];
    // Aprende: o nome digitado vira apelido do cliente escolhido.
    await this.repo.adicionarApelido(cliente.id, p.nomeDigitado);
    const r = await this.continuarComCliente(userId, p.intencao, p.texto, cliente);
    return [{ texto: `👤 ${escapar(cliente.nome)}`, editarOriginal: true }, ...r];
  }

  private async escolherParcela(userId: number, sessaoId: string, indice: number): Promise<Resposta[]> {
    const sessao = await this.repo.obterSessao(sessaoId);
    if (!sessao || !(await this.repo.consumirSessao(sessaoId))) {
      return [{ texto: '⌛ Esta pergunta expirou. Envie a mensagem de novo.', editarOriginal: true }];
    }
    const p = sessao.payload as EscolhaParcela;
    const parcelaId = p.opcoes[indice];
    if (!parcelaId) return [];
    return this.planejarProrrogacao(userId, p.intencao, p.texto, parcelaId);
  }

  // ─────────────────────────── botões dos alertas ───────────────────────────

  private async saldoDaParcela(parcelaId: string) {
    const { data } = await this.repo.db.from('parcelas').select('*').eq('id', parcelaId).maybeSingle();
    return data ? { parcela: data, saldo: saldoParcela(paraParcela(data)).total } : null;
  }

  private async recebidoTotal(userId: number, parcelaId: string): Promise<Resposta[]> {
    const s = await this.saldoDaParcela(parcelaId);
    if (!s || s.saldo === 0) return [{ texto: 'Esta parcela já está quitada. ✅' }];
    return this.planejarPagamentoParcela(userId, parcelaId, s.saldo, 'Recebido total (botão do alerta)');
  }

  private async planejarPagamentoParcela(userId: number, parcelaId: string, valor: Centavos, texto: string): Promise<Resposta[]> {
    const plano = await planejarPagamento(this.repo, { parcelaId, valor });
    if (plano.excedente > 0) {
      const f = await this.fmt();
      return [{ texto: `⚠️ ${f.dinheiro(valor)} é mais que o saldo em aberto desse empréstimo (${f.dinheiro(valor - plano.excedente)}).` }];
    }
    return this.pedirConfirmacao(userId, { acao: 'pagamento', plano, intencao: null, texto });
  }

  private async adiar(userId: number, parcelaId: string, dias: number): Promise<Resposta[]> {
    const s = await this.saldoDaParcela(parcelaId);
    if (!s || !Number.isInteger(dias) || dias <= 0) return [];
    // Adia a partir do maior entre o vencimento e hoje (adiar uma parcela atrasada "+3" conta de hoje).
    const hoje = await this.repo.hoje();
    const base = s.parcela.vencimento > hoje ? s.parcela.vencimento : hoje;
    return this.planejarAdiamento(userId, parcelaId, somarDias(base, dias), `Adiar +${dias} dias (botão do alerta)`);
  }

  private async planejarAdiamento(userId: number, parcelaId: string, data: DataISO, texto: string): Promise<Resposta[]> {
    const plano = await planejarRenegociacao(this.repo, { parcelaId, novoVencimento: data });
    return this.pedirConfirmacao(userId, { acao: 'renegociacao', plano, intencao: null, texto });
  }

  // ─────────────────────────── consultas ───────────────────────────

  private async consultar(r: Extract<Intencao, { tipo: 'consultar' }>): Promise<Resposta[]> {
    const d = r.dados;
    const hoje = await this.repo.hoje();
    const f = await this.fmt();
    if (d.tipo === 'saldo_cliente') {
      if (!d.cliente) return [{ texto: 'De qual cliente?' }];
      const clientes = await this.repo.listarClientes();
      const res = resolverCliente(d.cliente, clientes);
      if (res.tipo === 'unico') {
        const c = await this.repo.carregarCarteira({ clienteId: res.cliente.id });
        return [{ texto: textoCliente(c, res.cliente.id, hoje, f) }];
      }
      // Reaproveita a escolha de cliente com a intenção de consulta
      return this.sugerirClientes(d.cliente);
    }
    const c = await this.repo.carregarCarteira();
    switch (d.tipo) {
      case 'atrasados':
        return [{ texto: textoAtrasados(c, hoje, f) }];
      case 'resumo':
        return [{ texto: textoResumoCarteira(c, hoje, f) }];
      case 'a_receber_periodo': {
        const inicio = d.data_inicio ?? hoje;
        const fim = d.data_fim ?? inicio;
        return [{ texto: textoAReceber(c, { inicio, fim: fim < inicio ? inicio : fim }, hoje, f) }];
      }
    }
  }

  private async sugerirClientes(nome: string): Promise<Resposta[]> {
    const clientes = await this.repo.listarClientes();
    const res = resolverCliente(nome, clientes);
    const opcoes = res.tipo === 'ambiguo' ? res.opcoes : (await this.repo.buscarClientes(nome, 4)).filter((c) => c.similaridade >= 0.25);
    if (opcoes.length === 0) return [{ texto: `Não encontrei <b>${escapar(nome)}</b>.` }];
    return [{ texto: `Qual deles? Use /cliente com o nome completo:\n${opcoes.map((o) => `• ${escapar(o.nome)}`).join('\n')}` }];
  }

  // ─────────────────────────── erros ───────────────────────────

  private async protegido(fn: () => Promise<Resposta[]>): Promise<Resposta[]> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ErroRegra) return [{ texto: `⚠️ ${escapar(e.message)}` }];
      if (e instanceof ErroBanco && e.codigo === '40001') {
        return [{ texto: '⚠️ Os dados mudaram desde que preparei este lançamento (outro pagamento ou alteração). Envie de novo.' }];
      }
      this.log.error({ err: e }, 'erro inesperado');
      return [{ texto: '⚠️ Erro inesperado. Tente de novo em instantes.' }];
    }
  }
}
