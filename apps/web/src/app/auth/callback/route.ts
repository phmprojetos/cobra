import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/server';

/** Só caminhos internos (evita redirecionar para outro site). */
function destino(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

/**
 * Retorno dos links de e-mail (ex.: redefinir senha):
 *  • token_hash + type (modelo de e-mail recomendado; funciona abrindo o link em outro aparelho);
 *  • code (PKCE, modelo padrão do Supabase; precisa ser o mesmo navegador que pediu).
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const supabase = await supabaseServidor();
  const tokenHash = p.get('token_hash');
  const tipo = p.get('type') as EmailOtpType | null;
  const code = p.get('code');
  const { error } = tokenHash && tipo
    ? await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: true };
  if (!error) return NextResponse.redirect(new URL(destino(p.get('next')), request.url));
  return NextResponse.redirect(new URL('/login?erro=1', request.url));
}
