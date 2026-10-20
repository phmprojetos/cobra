import type { Db } from './cliente';
import { ok, okTalvez, semErro } from './repositorio';

/**
 * Operações que atravessam carteiras (uso exclusivo com service_role: bot e scripts):
 * descobrir a carteira de um Telegram, vincular, listar carteiras e criar usuários.
 */
export class Contas {
  constructor(readonly db: Db) {}

  async carteiraDoTelegram(telegramUserId: number): Promise<string | null> {
    const r = okTalvez(await this.db.from('vinculos_telegram').select('carteira_id').eq('telegram_user_id', telegramUserId).maybeSingle());
    return r?.carteira_id ?? null;
  }

  /** Consome o código gerado no painel. Devolve a carteira vinculada ou null (código inválido/expirado). */
  async vincularTelegram(codigo: string, telegramUserId: number, nome: string | null): Promise<string | null> {
    return okTalvez(await this.db.rpc('vincular_telegram', { p_codigo: codigo, p_telegram_user_id: telegramUserId, p_nome: nome ?? '' }));
  }

  async carteiras(): Promise<{ id: string; nome: string }[]> {
    return ok(await this.db.from('carteiras').select('id, nome').order('created_at'));
  }

  /** Telegrams vinculados a uma carteira (destino dos alertas quando não há canal). */
  async telegramsDaCarteira(carteiraId: string): Promise<number[]> {
    const r = ok(await this.db.from('vinculos_telegram').select('telegram_user_id').eq('carteira_id', carteiraId));
    return r.map((x) => x.telegram_user_id);
  }

  async criarCarteira(nome: string): Promise<string> {
    return ok(await this.db.rpc('criar_carteira', { p_nome: nome }));
  }

  async carteiraPorNome(nome: string): Promise<string | null> {
    const r = ok(await this.db.from('carteiras').select('id').ilike('nome', nome));
    return r.length === 1 ? r[0]!.id : null;
  }

  async adicionarMembro(userId: string, carteiraId: string, email: string): Promise<void> {
    semErro(await this.db.from('membros').upsert({ user_id: userId, carteira_id: carteiraId, email }));
  }

  async limparSessoesExpiradas(agora = new Date()): Promise<void> {
    const limite = new Date(agora.getTime() - 7 * 86_400_000).toISOString();
    semErro(await this.db.from('sessoes_bot').delete().lt('expira_em', limite));
  }
}
