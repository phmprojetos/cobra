'use client';

import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { env } from '@/lib/env';

/** Só caminhos internos (evita redirecionar para outro site). */
function destino(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

/**
 * Retorno do link de e-mail com o modelo padrão do Supabase (fluxo implícito): a sessão vem no
 * fragmento (#access_token=…&refresh_token=…), que só o navegador enxerga. Funciona em qualquer
 * aparelho, sem depender do navegador que pediu o link. Erros vêm em ?error= ou #error=.
 */
export default function Confirmar() {
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const busca = new URLSearchParams(window.location.search);
    const fragmento = new URLSearchParams(window.location.hash.slice(1));
    const next = destino(busca.get('next'));
    // Link no formato PKCE (?code=): quem troca o código é a rota do servidor.
    if (busca.get('code')) {
      window.location.replace(`/auth/callback${window.location.search}`);
      return;
    }
    const accessToken = fragmento.get('access_token');
    const refreshToken = fragmento.get('refresh_token');
    if (!accessToken || !refreshToken) {
      setErro(fragmento.get('error_description') ?? busca.get('error_description') ?? 'Link inválido.');
      return;
    }
    const supabase = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
      if (error) setErro(error.message);
      else window.location.replace(next);
    });
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{erro ? 'Link expirado ou inválido' : 'Confirmando…'}</CardTitle>
          <CardDescription>
            {erro ? 'Cada link vale uma vez e só o do último e-mail pedido funciona.' : 'Só um instante.'}
          </CardDescription>
        </CardHeader>
        {erro && (
          <CardContent className="space-y-3">
            <Link href="/login/recuperar" className="block text-sm font-medium underline-offset-4 hover:underline">
              Pedir um novo link
            </Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground block text-sm">
              Voltar para o login
            </Link>
          </CardContent>
        )}
      </Card>
    </main>
  );
}
