import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { Database, Db } from '@cobra/db';
import { cookies } from 'next/headers';
import { env } from '../env';

/** Cliente Supabase com a sessão do usuário (RLS aplicado). */
export async function supabaseServidor(): Promise<Db> {
  const store = await cookies();
  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) store.set(name, value, options);
        } catch {
          // Chamado de um Server Component: o proxy já renova a sessão.
        }
      },
    },
  }) as unknown as Db;
}
