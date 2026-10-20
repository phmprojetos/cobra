import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormularioLogin } from './formulario';

export default async function Login({ searchParams }: PageProps<'/login'>) {
  const { erro } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          {/* Logo completo (cobra + nome), arte original em public/marca/cobra-logo.png */}
          <Image src="/marca/cobra-logo.png" alt="Cobra" width={160} height={160} priority className="mx-auto mb-1 size-40 rounded-2xl shadow-md" />
          <CardTitle className="sr-only">Cobra</CardTitle>
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
