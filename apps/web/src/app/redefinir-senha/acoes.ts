'use server';

import { redirect } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';

export interface EstadoSenha {
  ok: boolean;
  mensagem: string;
}

export async function definirSenha(_: EstadoSenha | null, form: FormData): Promise<EstadoSenha> {
  const senha = String(form.get('senha') ?? '');
  const confirmacao = String(form.get('confirmacao') ?? '');
  if (senha.length < 8) return { ok: false, mensagem: 'A senha precisa ter pelo menos 8 caracteres.' };
  if (senha !== confirmacao) return { ok: false, mensagem: 'As senhas não conferem.' };
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?erro=1');
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) {
    if (error.code === 'same_password') return { ok: false, mensagem: 'A nova senha precisa ser diferente da atual.' };
    if (error.code === 'weak_password') return { ok: false, mensagem: 'Senha fraca. Use letras e números, com pelo menos 8 caracteres.' };
    return { ok: false, mensagem: 'Não foi possível salvar a senha. Tente de novo.' };
  }
  return { ok: true, mensagem: 'Senha salva.' };
}
