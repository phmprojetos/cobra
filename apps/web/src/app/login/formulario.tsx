'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { entrar, pedirRecuperacao } from './acoes';

export function FormularioLogin() {
  const [estado, acao, pendente] = useActionState(entrar, null);
  return (
    <form action={acao} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@exemplo.com" />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="senha">Senha</Label>
          <Link href="/login/recuperar" className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <Input id="senha" name="senha" type="password" autoComplete="current-password" required />
      </div>
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
