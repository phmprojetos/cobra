import 'server-only';
import { Repositorio } from '@cobra/db';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { supabaseServidor } from './server';

/**
 * Sessão do painel: usuário logado (magic link) e a carteira dele. Tudo no painel usa a sessão do
 * usuário (RLS), então ele só enxerga a própria carteira. Uma vez por requisição (cache).
 */
export const sessaoPainel = cache(async () => {
  const db = await supabaseServidor();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: membro } = await db.from('membros').select('carteira_id, carteiras(nome)').eq('user_id', user.id).maybeSingle();
  if (!membro) redirect('/login?erro=sem_carteira');
  return { db, user, carteiraId: membro.carteira_id, carteiraNome: membro.carteiras?.nome ?? '' };
});

/** Repositório da carteira do usuário logado. */
export async function repoPainel(): Promise<Repositorio> {
  const s = await sessaoPainel();
  return new Repositorio(s.db, s.carteiraId);
}
