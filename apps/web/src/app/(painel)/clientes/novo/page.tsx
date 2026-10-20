import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { FormularioCliente } from '@/components/clientes/formulario-cliente';
import { Secao } from '@/components/painel/ui';

export default function NovoCliente() {
  return (
    <>
      <div className="space-y-2">
        <Link href="/clientes" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-4" /> Clientes
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Novo cliente</h1>
        <p className="text-muted-foreground text-sm">Nome e documento são obrigatórios. Empréstimos continuam sendo lançados pelo Telegram.</p>
      </div>
      <Secao titulo="Dados do cliente" className="max-w-3xl">
        <FormularioCliente cancelarHref="/clientes" />
      </Secao>
    </>
  );
}
