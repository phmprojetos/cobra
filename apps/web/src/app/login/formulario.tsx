'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { entrar, pedirRecuperacao } from './acoes';

// E-mail lembrado só neste navegador; a senha fica com o gerenciador de senhas do navegador.
const CHAVE_EMAIL = 'cobra:email-lembrado';

export function FormularioLogin() {
  const [estado, acao, pendente] = useActionState(entrar, null);
  const email = useRef<HTMLInputElement>(null);
  const senha = useRef<HTMLInputElement>(null);
  const [lembrar, setLembrar] = useState(true);
  const [emailSalvo, setEmailSalvo] = useState('');

  useEffect(() => {
    // Sessão do link de e-mail que caiu aqui (Site URL → /login mantém o #fragmento).
    if (/(^#|&)(access_token|error)=/.test(window.location.hash)) {
      window.location.replace(`/auth/confirmar?next=/redefinir-senha${window.location.hash}`);
      return;
    }
    try {
      const salvo = localStorage.getItem(CHAVE_EMAIL);
      if (salvo && email.current && !email.current.value) {
        setEmailSalvo(salvo); // vira o defaultValue: o reset do form após um erro mantém o e-mail
        email.current.value = salvo;
        senha.current?.focus();
      }
    } catch {}
  }, []);

  function aoEnviar() {
    try {
      const valor = email.current?.value.trim().toLowerCase();
      if (lembrar && valor) localStorage.setItem(CHAVE_EMAIL, valor);
      else localStorage.removeItem(CHAVE_EMAIL);
    } catch {}
  }

  return (
    <form action={acao} onSubmit={aoEnviar} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input ref={email} id="email" name="email" type="email" defaultValue={emailSalvo} autoComplete="username" required placeholder="voce@exemplo.com" />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="senha">Senha</Label>
          <Link href="/login/recuperar" className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <Input ref={senha} id="senha" name="senha" type="password" autoComplete="current-password" required />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} className="accent-primary size-4" />
        Lembrar meu e-mail
      </label>
      <Button type="submit" className="w-full" disabled={pendente}>
        {pendente ? 'Entrando…' : 'Entrar'}
      </Button>
      {estado && !estado.ok && (
        <p role="alert" className="text-sm text-atraso">
          {estado.mensagem}
        </p>
      )}
    </form>
  );
}

export function FormularioRecuperacao() {
  const [estado, acao, pendente] = useActionState(pedirRecuperacao, null);
  if (estado?.ok) {
    return (
      <p role="status" className="text-sm">
        {estado.mensagem} Confira também a caixa de spam.
      </p>
    );
  }
  return (
    <form action={acao} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail da conta</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@exemplo.com" />
      </div>
      <Button type="submit" className="w-full" disabled={pendente}>
        {pendente ? 'Enviando…' : 'Enviar link para nova senha'}
      </Button>
      {estado && (
        <p role="alert" className="text-sm text-atraso">
          {estado.mensagem}
        </p>
      )}
    </form>
  );
}
