'use client';

import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { CheckCircle2, FileUp, Loader2, XCircle } from 'lucide-react';
import { confirmarEnvio, prepararEnvio } from '@/app/(painel)/clientes/documentos-acoes';
import { ACCEPT, formatarBytes, validarArquivo } from '@/lib/documentos';
import { cn } from '@/lib/utils';

const BUCKET = 'documentos-clientes';

export interface ItemEnvio {
  nome: string;
  tamanho: number;
  estado: 'enviando' | 'ok' | 'erro';
  erro?: string;
}

let navegador: ReturnType<typeof createClient> | null = null;
function storage() {
  // Envio por URL assinada: o token autoriza só aquele arquivo; não precisa de sessão.
  navegador ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  return navegador.storage.from(BUCKET);
}

/** Envia arquivos direto ao Supabase Storage (sem passar pelo servidor do painel) e registra no cliente. */
export async function enviarDocumentos(clienteId: string, arquivos: File[], aoMudar: (itens: ItemEnvio[]) => void): Promise<ItemEnvio[]> {
  const itens: ItemEnvio[] = arquivos.map((f) => ({ nome: f.name, tamanho: f.size, estado: 'enviando' }));
  aoMudar([...itens]);
  for (const [i, f] of arquivos.entries()) {
    const falha = (erro: string) => {
      itens[i] = { ...itens[i]!, estado: 'erro', erro };
      aoMudar([...itens]);
    };
    const invalido = validarArquivo(f.name, f.type, f.size);
    if (invalido) {
      falha(invalido);
      continue;
    }
    try {
      const prep = await prepararEnvio(clienteId, f.name, f.type, f.size);
      if ('erro' in prep) {
        falha(prep.erro);
        continue;
      }
      const up = await storage().uploadToSignedUrl(prep.caminho, prep.token, f, { contentType: prep.tipo });
      if (up.error) {
        falha(`Falha no envio: ${up.error.message}`);
        continue;
      }
      const conf = await confirmarEnvio(clienteId, prep.caminho, f.name);
      if ('erro' in conf) {
        falha(conf.erro);
        continue;
      }
      itens[i] = { ...itens[i]!, estado: 'ok' };
      aoMudar([...itens]);
    } catch {
      falha('Falha de conexão. Tente de novo.');
    }
  }
  return itens;
}

export function ListaEnvio({ itens }: { itens: ItemEnvio[] }) {
  if (!itens.length) return null;
  return (
    <ul className="space-y-1.5 text-sm">
      {itens.map((it, i) => (
        <li key={i} className="flex items-center gap-2">
          {it.estado === 'enviando' ? (
            <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden />
          ) : it.estado === 'ok' ? (
            <CheckCircle2 className="text-pago size-4" aria-hidden />
          ) : (
            <XCircle className="text-atraso size-4" aria-hidden />
          )}
          <span className="truncate">{it.nome}</span>
          <span className="text-muted-foreground shrink-0 text-xs">{formatarBytes(it.tamanho)}</span>
          {it.erro && <span className="text-atraso text-xs">{it.erro}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Área de envio da ficha do cliente: clique ou arraste; envia na hora. */
export function EnvioDocumentos({ clienteId }: { clienteId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [itens, setItens] = useState<ItemEnvio[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const enviando = itens.some((i) => i.estado === 'enviando');
  // Trava contra envio duplicado (duplo clique / dois eventos de seleção).
  const ocupado = useRef(false);

  async function processar(lista: FileList | null) {
    if (!lista?.length || ocupado.current) return;
    ocupado.current = true;
    const arquivos = [...lista];
    if (input.current) input.current.value = ''; // permite escolher o mesmo arquivo de novo
    try {
      await enviarDocumentos(clienteId, arquivos, setItens);
      router.refresh();
    } finally {
      ocupado.current = false;
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={enviando}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          void processar(e.dataTransfer.files);
        }}
        className={cn(
          'hover:bg-muted/50 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
          arrastando && 'border-em-dia-fill bg-em-dia-fill/5',
          enviando && 'opacity-60',
        )}
      >
        {enviando ? <Loader2 className="text-muted-foreground size-6 animate-spin" aria-hidden /> : <FileUp className="text-muted-foreground size-6" aria-hidden />}
        <span className="text-sm font-medium">{enviando ? 'Enviando…' : 'Enviar documentos'}</span>
        <span className="text-muted-foreground text-xs">Clique ou arraste · PDF, JPG, PNG, WEBP ou HEIC · até 10 MB cada</span>
      </button>
      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => void processar(e.target.files)} />
      <ListaEnvio itens={itens} />
    </div>
  );
}
