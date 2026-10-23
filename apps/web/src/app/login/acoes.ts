'use server';

import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { supabaseServidor } from '@/lib/supabase/server';

export interface EstadoLogin {
  ok: boolean;
  mensagem: string;
}

const EMAIL = /^\S+@\S+\.\S+$/;

async function origem(): Promise<string> {
  const h = await headers();
  return process.env.NEXT_PUBLIC_SITE_URL ?? h.get('origin') ?? `http://${h.get('host')}`;
}

export async function entrar(_: EstadoLogin | null, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const senha = String(form.get('senha') ?? '');
  if (!EMAIL.test(email) || !senha) return { ok: false, mensagem: 'Informe e-mail e senha.' };
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) {
    if (error.code === 'invalid_credentials') return { ok: false, mensagem: 'E-mail ou senha incorretos.' };
    if (error.status === 429) return { ok: false, mensagem: 'Muitas tentativas. Aguarde alguns minutos.' };
    return { ok: false, mensagem: 'Não foi possível entrar agora. Tente de novo.' };
  }
  redirect('/');
}

/** Envia o e-mail de redefinição. Mesma resposta exista ou não a conta (não revela quem tem acesso). */
export async function pedirRecuperacao(_: EstadoLogin | null, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, mensagem: 'E-mail inválido.' };
  // Fluxo implícito: o link do e-mail (modelo padrão do Supabase) traz a sessão e abre em qualquer
  // aparelho. No PKCE ele só funcionaria no mesmo navegador que pediu.
  const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origem()}/auth/confirmar?next=/redefinir-senha`,
  });
  if (error?.status === 429) return { ok: false, mensagem: 'Muitos pedidos. Aguarde alguns minutos e tente de novo.' };
  return { ok: true, mensagem: 'Se o e-mail tiver acesso, você vai receber um link para criar uma nova senha.' };
}
