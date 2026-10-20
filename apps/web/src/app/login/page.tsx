import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormularioLogin } from './formulario';

export default async function Login({ searchParams }: PageProps<'/login'>) {
  const { erro } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Cobra</CardTitle>
          <CardDescription>Entre com o link mágico enviado ao seu e-mail.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {erro && <p className="text-sm text-atraso">O link expirou ou é inválido. Peça outro.</p>}
          <FormularioLogin />
        </CardContent>
      </Card>
    </main>
  );
}
