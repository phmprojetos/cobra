import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabaseServidor } from '@/lib/supabase/server';
import { FormularioSenha } from './formulario';

/** Criar/alterar a senha: depois do link "Esqueci minha senha" ou por Configurações (já logado). */
export default async function RedefinirSenha() {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Nova senha</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioSenha />
        </CardContent>
      </Card>
    </main>
  );
}
