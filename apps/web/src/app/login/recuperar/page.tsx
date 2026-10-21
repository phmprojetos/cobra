import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormularioRecuperacao } from '../formulario';

export default function Recuperar() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Esqueci minha senha</CardTitle>
          <CardDescription>Enviaremos um link para você criar uma nova senha.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormularioRecuperacao />
          <Link href="/login" className="text-muted-foreground hover:text-foreground block text-center text-sm">
            Voltar para o login
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
