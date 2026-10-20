import { Download, Eye, FileText, Files, ImageIcon, Trash2 } from 'lucide-react';
import { removerDocumento } from '@/app/(painel)/clientes/documentos-acoes';
import { Secao, Vazio } from '@/components/painel/ui';
import { MODO_DEMO } from '@/lib/demo';
import { exibivel, formatarBytes } from '@/lib/documentos';
import { repoPainel } from '@/lib/supabase/painel';
import { EnvioDocumentos } from './envio-documentos';

/** Seção "Documentos" da ficha: lista com miniaturas e links temporários (bucket privado). */
export async function DocumentosCliente({ clienteId }: { clienteId: string }) {
  if (MODO_DEMO) {
    return (
      <Secao titulo="Documentos">
        <Vazio icone={Files} titulo="Indisponível no modo demonstração" />
      </Secao>
    );
  }
  const repo = await repoPainel();
  const docs = await repo.documentosDoCliente(clienteId);
  // Links válidos por 5 minutos: nada fica exposto por link público. As miniaturas usam <img> comum
  // (URL assinada temporária, que não deve passar pelo otimizador de imagens).
  const urls = await Promise.all(docs.map((d) => repo.urlsDocumento(d.caminho, d.nome_arquivo)));

  return (
    <Secao
      titulo={
        <span className="flex items-center gap-2">
          <Files className="text-muted-foreground size-4" aria-hidden /> Documentos
        </span>
      }
      descricao="RG, CPF, comprovantes… Arquivos privados: links de acesso expiram em 5 minutos."
    >
      <div className="space-y-5">
        {docs.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {docs.map((d, i) => {
              const u = urls[i]!;
              const imagem = d.tipo_mime.startsWith('image/');
              return (
                <li key={d.id} className="bg-background flex gap-3 rounded-xl border p-3">
                  <a href={u.ver} target="_blank" rel="noreferrer" className="bg-muted flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                    {exibivel(d.tipo_mime) ? (
                      <img src={u.ver} alt={d.nome_arquivo} className="size-full object-cover" />
                    ) : imagem ? (
                      <ImageIcon className="text-muted-foreground size-6" aria-hidden />
                    ) : (
                      <FileText className="text-atraso size-6" aria-hidden />
                    )}
                  </a>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={d.nome_arquivo}>
                      {d.nome_arquivo}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {d.tipo_mime === 'application/pdf' ? 'PDF' : d.tipo_mime.replace('image/', '').toUpperCase()} · {formatarBytes(d.tamanho_bytes)} ·{' '}
                      {new Date(d.created_at).toLocaleDateString('pt-BR')}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-xs font-medium">
                      <a href={u.ver} target="_blank" rel="noreferrer" className="text-em-dia inline-flex items-center gap-1 hover:underline">
                        <Eye className="size-3.5" /> Ver
                      </a>
                      <a href={u.baixar} className="text-em-dia inline-flex items-center gap-1 hover:underline">
                        <Download className="size-3.5" /> Baixar
                      </a>
                      <form action={removerDocumento.bind(null, clienteId, d.id)}>
                        <button type="submit" className="text-muted-foreground hover:text-atraso inline-flex items-center gap-1">
                          <Trash2 className="size-3.5" /> Remover
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <EnvioDocumentos clienteId={clienteId} />
      </div>
    </Secao>
  );
}
