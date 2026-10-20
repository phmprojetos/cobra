'use server';

import { ErroRegra, parseValor } from '@cobra/core';
import { ErroBanco, executarPagamento, planejarPagamento, Repositorio } from '@cobra/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { fonteDemo, MODO_DEMO } from '@/lib/demo';
import { supabaseServidor } from '@/lib/supabase/server';

export async function sair() {
  if (MODO_DEMO) redirect('/');
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  redirect('/login');
}

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
}

/** Registra pagamento de uma parcela pelo painel (o excedente abate as próximas da operação). */
export async function registrarPagamento(_: ResultadoAcao | null, form: FormData): Promise<ResultadoAcao> {
  const parcelaId = String(form.get('parcelaId') ?? '');
  const valor = parseValor(String(form.get('valor') ?? ''));
  const data = String(form.get('data') ?? '') || undefined;
  if (!parcelaId || !valor || valor <= 0) return { ok: false, mensagem: 'Informe um valor válido.' };
  if (MODO_DEMO) {
    const erro = fonteDemo.pagar(parcelaId, valor, data, String(form.get('forma') ?? '') || null);
    if (erro) return { ok: false, mensagem: erro };
    revalidatePath('/', 'layout');
    return { ok: true, mensagem: 'Pagamento registrado (modo demonstração, só em memória).' };
  }
  try {
    const repo = new Repositorio(await supabaseServidor());
    const plano = await planejarPagamento(repo, { parcelaId, valor, ...(data ? { data } : {}), forma: String(form.get('forma') ?? '') || null });
    if (plano.excedente > 0) return { ok: false, mensagem: 'O valor é maior que o saldo em aberto deste empréstimo.' };
    await executarPagamento(repo, plano, { origem: 'web' });
  } catch (e) {
    if (e instanceof ErroRegra) return { ok: false, mensagem: e.message };
    if (e instanceof ErroBanco && e.codigo === '40001') return { ok: false, mensagem: 'Os dados mudaram. Recarregue e tente de novo.' };
    throw e;
  }
  revalidatePath('/', 'layout');
  return { ok: true, mensagem: 'Pagamento registrado.' };
}
