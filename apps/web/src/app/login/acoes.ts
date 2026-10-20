'use server';

import { headers } from 'next/headers';
import { supabaseServidor } from '@/lib/supabase/server';

export interface EstadoLogin {
  ok: boolean;
  mensagem: string;
}

export async function enviarMagicLink(_: EstadoLogin | null, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get('email') ?? '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, mensagem: 'E-mail inválido.' };
  const h = await headers();
  const origem = process.env.NEXT_PUBLIC_SITE_URL ?? h.get('origin') ?? `http://${h.get('host')}`;
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Usuário único: o cadastro público é desativado; só e-mails já criados recebem o link.
    options: { shouldCreateUser: false, emailRedirectTo: `${origem}/auth/callback` },
  });
  // Mesma resposta para e-mail existente ou não (não revela quem tem conta).
  if (error && error.status !== 422 && error.code !== 'otp_disabled' && error.code !== 'user_not_found') {
    return { ok: false, mensagem: 'Não foi possível enviar o link agora. Tente de novo.' };
  }
  return { ok: true, mensagem: 'Se o e-mail estiver autorizado, você receberá um link de acesso.' };
}
