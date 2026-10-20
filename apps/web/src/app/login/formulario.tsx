'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { enviarMagicLink } from './acoes';

export function FormularioLogin() {
  const [estado, acao, pendente] = useActionState(enviarMagicLink, null);
  return (
    <form action={acao} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@exemplo.com" />
      </div>
      <Button type="submit" className="w-full" disabled={pendente}>
        {pendente ? 'Enviando…' : 'Receber link de acesso'}
      </Button>
      {estado && (
        <p role="status" className={estado.ok ? 'text-sm text-muted-foreground' : 'text-sm text-atraso'}>
          {estado.mensagem}
        </p>
      )}
    </form>
  );
}
