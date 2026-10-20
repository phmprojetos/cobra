import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { formatarDocumento } from '@cobra/core';
import { FormularioCliente } from '@/components/clientes/formulario-cliente';
import { Secao } from '@/components/painel/ui';
import { carregarPainel } from '@/lib/painel';

export default async function EditarCliente({ params }: PageProps<'/clientes/[id]/editar'>) {
  const { id } = await params;
  const { carteira } = await carregarPainel();
  const c = carteira.clientes.get(id);
  if (!c) notFound();
  const documento =
    c.documento_tipo === 'cpf' || c.documento_tipo === 'cnpj' ? formatarDocumento(c.documento_tipo, c.documento) : (c.documento ?? '');
  return (
    <>
      <div className="space-y-2">
        <Link href={`/clientes/${id}`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-4" /> {c.nome}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Editar cliente</h1>
        <p className="text-muted-foreground text-sm">As alterações ficam registradas no histórico (antes → depois).</p>
      </div>
      <Secao titulo="Dados do cliente" className="max-w-3xl">
        <FormularioCliente
          cancelarHref={`/clientes/${id}`}
          valores={{
            id,
            nome: c.nome,
            tipoDocumento: c.documento_tipo === 'rg' ? 'rg' : c.documento_tipo === 'outro' ? 'outro' : 'auto',
            documento,
            telefone: c.telefone ?? '',
            apelidos: c.apelidos.join(', '),
            observacoes: c.observacoes ?? '',
          }}
        />
      </Secao>
    </>
  );
}
