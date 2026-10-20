import 'server-only';
import { criarClienteServico, type Db } from '@cobra/db';
import { supabaseServidor } from './server';

/**
 * PAINEL_SEM_LOGIN=true: painel aberto, só para uso LOCAL (o servidor de dev escuta em 127.0.0.1).
 * Sem usuário, o servidor lê com a service role (que nunca vai ao navegador).
 * Recusado em produção para não publicar o painel aberto por engano.
 */
export const SEM_LOGIN = process.env.PAINEL_SEM_LOGIN === 'true';

if (SEM_LOGIN && process.env.NODE_ENV === 'production') {
  throw new Error('PAINEL_SEM_LOGIN não é permitido em produção. Remova a variável e use o login por magic link.');
}

/** Cliente Supabase do painel: sessão do usuário (RLS) ou, sem login, service role no servidor. */
export async function dbPainel(): Promise<Db> {
  if (!SEM_LOGIN) return supabaseServidor();
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error('PAINEL_SEM_LOGIN exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  return criarClienteServico(url, chave);
}
