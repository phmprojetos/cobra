'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { definirSenha } from './acoes';

export function FormularioSenha() {
  const [estado, acao, pendente] = useActionState(definirSenha, null);
  if (estado?.ok) {
    return (
      <div className="space-y-3">
        <p role="status" className="text-pago text-sm font-medium">
          ✓ Senha salva. Use-a nos próximos acessos.
        </p>
        <Button className="w-full" nativeButton={false} render={<Link href="/" />}>
          Ir para o painel
        </Button>
      </div>
    );
  }
  return (
    <form action={acao} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="senha">Nova senha</Label>
        <Input id="senha" name="senha" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmacao">Repita a senha</Label>
        <Input id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <Button type="submit" className="w-full" disabled={pendente}>
        {pendente ? 'Salvando…' : 'Salvar senha'}
      </Button>
      {estado && (
        <p role="alert" className="text-sm text-atraso">
          {estado.mensagem}
        </p>
      )}
    </form>
  );
}
