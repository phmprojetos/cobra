import {
  chaveAlerta,
  dataLocal,
  ErroRegra,
  normalizarNome,
  somarDias,
  type Carteira,
  type DataISO,
  type Documento,
} from '@cobra/core';
import type { Db } from './cliente';
import type { Json } from './database.types';
import {
  montarConfiguracao,
  paraOperacao,
  paraPagamento,
  paraParcela,
  type ClienteRow,
  type Configuracao,
  type EventoRow,
  type OperacaoRow,
  type PagamentoRow,
  type ParcelaRow,
  type RegraRow,
} from './mapeadores';

export class ErroBanco extends Error {
  constructor(
    mensagem: string,
    public readonly codigo?: string,
  ) {
    super(mensagem);
    this.name = 'ErroBanco';
  }
}

type Resposta<T> = { data: T; error: { message: string; code?: string } | null };

/** Dados obrigatórios: lança em erro ou se vier vazio. */
export function ok<T>(res: Resposta<T>): NonNullable<T> {
  if (res.error) throw new ErroBanco(res.error.message, res.error.code);
  if (res.data === null || res.data === undefined) throw new ErroBanco('Registro não encontrado');
  return res.data;
}

/** Dados opcionais (maybeSingle). */
export function okTalvez<T>(res: Resposta<T>): T {
  if (res.error) throw new ErroBanco(res.error.message, res.error.code);
  return res.data;
}

/** Comandos sem retorno. */
export function semErro(res: { error: { message: string; code?: string } | null }): void {
  if (res.error) throw new ErroBanco(res.error.message, res.error.code);
}

export interface CarteiraCompleta {
  clientes: Map<string, ClienteRow>;
  operacoes: OperacaoRow[];
  parcelas: ParcelaRow[];
  pagamentos: PagamentoRow[];
  /** Mesmos dados no formato do core, para cálculos. */
  carteira: Carteira;
}

export interface SessaoBot {
  id: string;
  telegramUserId: number;
  estado: string;
  payload: unknown;
  expiraEm: string;
}

export type Env = Partial<Record<'MOEDA' | 'LOCALE' | 'TIMEZONE', string | undefined>>;

export class Repositorio {
  private cacheConfig: { valor: Configuracao; em: number } | null = null;

  constructor(
    readonly db: Db,
    private readonly env: Env = {},
    readonly relogio: () => Date = () => new Date(),
  ) {}

  // ───────────── configuração ─────────────

  async configuracao(): Promise<Configuracao> {
    if (this.cacheConfig && Date.now() - this.cacheConfig.em < 30_000) return this.cacheConfig.valor;
    const linhas = ok(await this.db.from('configuracoes').select('chave, valor'));
    const valor = montarConfiguracao(linhas, this.env);
    this.cacheConfig = { valor, em: Date.now() };
    return valor;
  }

  /** Define (ou remove, com null) o canal que recebe os alertas automáticos. */
  async salvarCanalAlertas(canal: { id: number; titulo: string } | null): Promise<void> {
    semErro(await this.db.from('configuracoes').upsert({ chave: 'canal_alertas', valor: canal ?? false }));
    this.limparCacheConfig();
  }

  limparCacheConfig(): void {
    this.cacheConfig = null;
  }

  async hoje(): Promise<DataISO> {
    return dataLocal(this.relogio(), (await this.configuracao()).timezone);
  }

  // ───────────── clientes ─────────────

  async listarClientes(apenasAtivos = true): Promise<ClienteRow[]> {
    let q = this.db.from('clientes').select('*').order('nome');
    if (apenasAtivos) q = q.eq('ativo', true);
    return ok(await q);
  }

  async cliente(id: string): Promise<ClienteRow | null> {
    return okTalvez(await this.db.from('clientes').select('*').eq('id', id).maybeSingle());
  }

  async buscarClientes(termo: string, limite = 5) {
    return ok(await this.db.rpc('buscar_clientes', { p_termo: termo, p_limite: limite }));
  }

  /** Cadastro exige nome + documento; o documento é único (chave contra duplicidade). */
  async criarCliente(c: {
    nome: string;
    documento: Documento;
    apelidos?: string[];
    telefone?: string | null;
    observacoes?: string | null;
  }): Promise<ClienteRow> {
    const res = await this.db
      .from('clientes')
      .insert({
        nome: c.nome.trim(),
        documento_tipo: c.documento.tipo,
        documento: c.documento.numero,
        apelidos: c.apelidos ?? [],
        telefone: c.telefone ?? null,
        observacoes: c.observacoes ?? null,
      })
      .select('*')
      .single();
    if (res.error?.code === '23505') {
      throw new ErroRegra('documento_duplicado', 'Já existe um cliente com este documento.');
    }
    return ok(res);
  }

  /** Edita o cadastro (a trigger de auditoria guarda antes/depois em `eventos`). */
  async atualizarCliente(
    id: string,
    patch: Partial<{ nome: string; apelidos: string[]; telefone: string | null; observacoes: string | null; documento: Documento }>,
  ): Promise<ClienteRow> {
    const { documento, ...resto } = patch;
    const dados = { ...resto, ...(documento ? { documento_tipo: documento.tipo, documento: documento.numero } : {}) };
    const res = await this.db.from('clientes').update(dados).eq('id', id).select('*').single();
    if (res.error?.code === '23505') {
      throw new ErroRegra('documento_duplicado', 'Já existe outro cliente com este documento.');
    }
    return ok(res);
  }

  async clientePorDocumento(d: Documento): Promise<ClienteRow | null> {
    return okTalvez(
      await this.db.from('clientes').select('*').eq('documento_tipo', d.tipo).eq('documento', d.numero).maybeSingle(),
    );
  }

  /** Guarda um nome alternativo (ex.: como o cliente foi chamado num lançamento). Ignora repetidos. */
  async adicionarApelido(clienteId: string, apelido: string): Promise<void> {
    const c = await this.cliente(clienteId);
    const novo = apelido.trim();
    if (!c || !novo) return;
    const ja = [c.nome, ...c.apelidos].some((n) => normalizarNome(n) === normalizarNome(novo));
    if (ja) return;
    semErro(await this.db.from('clientes').update({ apelidos: [...c.apelidos, novo] }).eq('id', clienteId));
  }

  // ───────────── documentos do cliente (Storage privado) ─────────────

  static readonly BUCKET_DOCUMENTOS = 'documentos-clientes';

  /** Gera uma URL de envio assinada (uso único) para o navegador enviar direto ao Storage. */
  async prepararEnvioDocumento(caminho: string): Promise<{ caminho: string; token: string }> {
    const r = await this.db.storage.from(Repositorio.BUCKET_DOCUMENTOS).createSignedUploadUrl(caminho);
    if (r.error) throw new ErroBanco(r.error.message);
    return { caminho: r.data.path, token: r.data.token };
  }

  /** Confere que o arquivo chegou ao Storage e devolve tamanho/tipo reais (não confia no navegador). */
  async metadadosArquivo(caminho: string): Promise<{ tamanho: number; tipo: string } | null> {
    const pasta = caminho.split('/').slice(0, -1).join('/');
    const nome = caminho.split('/').pop()!;
    const r = await this.db.storage.from(Repositorio.BUCKET_DOCUMENTOS).list(pasta, { search: nome, limit: 5 });
    if (r.error) throw new ErroBanco(r.error.message);
    const f = r.data.find((x) => x.name === nome);
    if (!f) return null;
    const meta = (f.metadata ?? {}) as { size?: number; mimetype?: string };
    return { tamanho: meta.size ?? 0, tipo: meta.mimetype ?? '' };
  }

  async registrarDocumento(d: { clienteId: string; caminho: string; nome: string; tipo: string; tamanho: number; origem?: 'web' | 'telegram' }) {
    return ok(
      await this.db
        .from('cliente_documentos')
        .insert({ cliente_id: d.clienteId, caminho: d.caminho, nome_arquivo: d.nome, tipo_mime: d.tipo, tamanho_bytes: d.tamanho, origem: d.origem ?? 'web' })
        .select('*')
        .single(),
    );
  }

  async documentosDoCliente(clienteId: string) {
    return ok(
      await this.db
        .from('cliente_documentos')
        .select('*')
        .eq('cliente_id', clienteId)
        .is('removido_em', null)
        .order('created_at', { ascending: false }),
    );
  }

  /** URLs temporárias (bucket privado): visualizar e baixar. */
  async urlsDocumento(caminho: string, nome: string, segundos = 300): Promise<{ ver: string; baixar: string }> {
    const b = this.db.storage.from(Repositorio.BUCKET_DOCUMENTOS);
    const [ver, baixar] = await Promise.all([b.createSignedUrl(caminho, segundos), b.createSignedUrl(caminho, segundos, { download: nome })]);
    if (ver.error || baixar.error) throw new ErroBanco((ver.error ?? baixar.error)!.message);
    return { ver: ver.data.signedUrl, baixar: baixar.data.signedUrl };
  }

  /** Remoção lógica: some da lista, o arquivo continua guardado. */
  async removerDocumento(id: string, clienteId: string): Promise<void> {
    semErro(await this.db.from('cliente_documentos').update({ removido_em: new Date().toISOString() }).eq('id', id).eq('cliente_id', clienteId));
  }

  // ───────────── carteira ─────────────

  /** Carrega operações (canceladas só por id), parcelas e pagamentos. Volume de um usuário cabe em memória. */
  async carregarCarteira(filtro: { clienteId?: string; operacaoId?: string } = {}): Promise<CarteiraCompleta> {
    let qOps = this.db.from('operacoes').select('*');
    // Canceladas só entram quando a operação é pedida explicitamente (tela de detalhe).
    if (!filtro.operacaoId) qOps = qOps.neq('status', 'cancelada');
    if (filtro.clienteId) qOps = qOps.eq('cliente_id', filtro.clienteId);
    if (filtro.operacaoId) qOps = qOps.eq('id', filtro.operacaoId);
    const operacoes = ok(await qOps.order('data_emprestimo', { ascending: false }));
    const opIds = operacoes.map((o) => o.id);

    const [parcelas, clientes] = await Promise.all([
      opIds.length ? this.emLotes(opIds, (ids) => this.db.from('parcelas').select('*').in('operacao_id', ids)) : [],
      this.listarClientes(false),
    ]);
    const parIds = parcelas.map((p) => p.id);
    const pagamentos = parIds.length
      ? await this.emLotes(parIds, (ids) =>
          this.db.from('pagamentos').select('*').in('parcela_id', ids).is('cancelado_em', null),
        )
      : [];

    return {
      clientes: new Map(clientes.map((c) => [c.id, c])),
      operacoes,
      parcelas,
      pagamentos,
      carteira: {
        operacoes: operacoes.map(paraOperacao),
        parcelas: parcelas.map(paraParcela),
        pagamentos: pagamentos.map(paraPagamento),
      },
    };
  }

  private async emLotes<T>(
    ids: string[],
    consulta: (ids: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ): Promise<T[]> {
    const res: T[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      res.push(...ok(await consulta(ids.slice(i, i + 200))));
    }
    return res;
  }

  async eventos(entidadeIds: string[]): Promise<EventoRow[]> {
    if (entidadeIds.length === 0) return [];
    return ok(
      await this.db
        .from('eventos')
        .select('*')
        .in('entidade_id', entidadeIds)
        .order('created_at', { ascending: false }),
    );
  }

  // ───────────── notificações ─────────────

  async regras(): Promise<RegraRow[]> {
    return ok(await this.db.from('regras_notificacao').select('*').order('tipo').order('offset_dias'));
  }

  async chavesEnviadas(desde: DataISO): Promise<Set<string>> {
    const linhas = ok(
      await this.db
        .from('notificacoes_enviadas')
        .select('regra_id, parcela_id, data_referencia')
        .gte('data_referencia', desde),
    );
    return new Set(linhas.map((l) => chaveAlerta(l.regra_id, l.parcela_id, l.data_referencia)));
  }

  /**
   * Reserva o envio antes de mandar a mensagem. Retorna false se já existia (outro processo enviou):
   * a constraint única garante que o mesmo alerta nunca sai duas vezes.
   */
  async reservarNotificacao(regraId: string, parcelaId: string | null, dataReferencia: DataISO): Promise<string | null> {
    const res = await this.db
      .from('notificacoes_enviadas')
      .insert({ regra_id: regraId, parcela_id: parcelaId, data_referencia: dataReferencia })
      .select('id')
      .single();
    if (res.error?.code === '23505') return null;
    return ok(res).id;
  }

  async confirmarNotificacao(id: string, telegramMessageId: number): Promise<void> {
    semErro(await this.db.from('notificacoes_enviadas').update({ telegram_message_id: telegramMessageId }).eq('id', id));
  }

  async liberarNotificacao(id: string): Promise<void> {
    semErro(await this.db.from('notificacoes_enviadas').delete().eq('id', id));
  }

  // ───────────── sessões do bot ─────────────

  async criarSessao(telegramUserId: number, estado: string, payload: unknown, ttlMinutos = 30): Promise<string> {
    const expira = new Date(this.relogio().getTime() + ttlMinutos * 60_000).toISOString();
    const r = ok(
      await this.db
        .from('sessoes_bot')
        .insert({ telegram_user_id: telegramUserId, estado, payload: (payload ?? {}) as { [k: string]: Json }, expira_em: expira })
        .select('id')
        .single(),
    );
    return r.id;
  }

  async obterSessao(id: string): Promise<SessaoBot | null> {
    const r = okTalvez(
      await this.db
        .from('sessoes_bot')
        .select('*')
        .eq('id', id)
        .gt('expira_em', this.relogio().toISOString())
        .maybeSingle(),
    );
    return r ? this.paraSessao(r) : null;
  }

  /** Sessão mais recente do usuário num dos estados informados (ex.: aguardando texto). */
  async sessaoAtiva(telegramUserId: number, estados: string[]): Promise<SessaoBot | null> {
    const r = okTalvez(
      await this.db
        .from('sessoes_bot')
        .select('*')
        .eq('telegram_user_id', telegramUserId)
        .in('estado', estados)
        .gt('expira_em', this.relogio().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    return r ? this.paraSessao(r) : null;
  }

  async atualizarSessao(id: string, estado: string, payload: unknown, ttlMinutos = 30): Promise<void> {
    const expira = new Date(this.relogio().getTime() + ttlMinutos * 60_000).toISOString();
    semErro(
      await this.db
        .from('sessoes_bot')
        .update({ estado, payload: (payload ?? {}) as { [k: string]: Json }, expira_em: expira })
        .eq('id', id),
    );
  }

  /** Consome a sessão (expira imediatamente). Retorna false se já tinha sido consumida — evita duplo clique. */
  async consumirSessao(id: string): Promise<boolean> {
    const agora = this.relogio().toISOString();
    const r = ok(
      await this.db
        .from('sessoes_bot')
        .update({ expira_em: agora, estado: 'consumida' })
        .eq('id', id)
        .gt('expira_em', agora)
        .select('id'),
    );
    return r.length > 0;
  }

  async limparSessoesExpiradas(): Promise<void> {
    const limite = new Date(this.relogio().getTime() - 7 * 86_400_000).toISOString();
    semErro(await this.db.from('sessoes_bot').delete().lt('expira_em', limite));
  }

  private paraSessao(r: {
    id: string;
    telegram_user_id: number;
    estado: string;
    payload: Json;
    expira_em: string;
  }): SessaoBot {
    return {
      id: r.id,
      telegramUserId: r.telegram_user_id,
      estado: r.estado,
      payload: r.payload,
      expiraEm: r.expira_em,
    };
  }

  /** Janela de leitura de notificações já enviadas (cobre "ontem" + folga). */
  async desdeParaNotificacoes(): Promise<DataISO> {
    return somarDias(await this.hoje(), -3);
  }
}
