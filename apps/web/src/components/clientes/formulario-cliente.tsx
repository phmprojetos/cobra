'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { mascararTelefone } from '@cobra/core';
import { AlertTriangle, FileUp, Loader2, Save } from 'lucide-react';
import { ACCEPT, formatarBytes } from '@/lib/documentos';
import { enviarDocumentos, ListaEnvio, type ItemEnvio } from './envio-documentos';
import { salvarCliente, type EstadoCliente } from '@/app/(painel)/clientes/acoes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface ValoresCliente {
  id?: string;
  nome?: string;
  tipoDocumento?: 'auto' | 'rg' | 'outro';
  documento?: string;
  telefone?: string;
  apelidos?: string;
  observacoes?: string;
}

/** Telefone com máscara aplicada enquanto se digita: (11) 99999-9999. */
function TelefoneInput({ valorInicial, ...props }: { valorInicial?: string | undefined } & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'defaultValue'>) {
  const [valor, setValor] = useState(mascararTelefone(valorInicial ?? ''));
  return <Input {...props} value={valor} onChange={(e) => setValor(mascararTelefone(e.target.value))} inputMode="tel" autoComplete="tel" maxLength={19} />;
}

function Campo({ id, rotulo, obrigatorio, erro, dica, children }: { id: string; rotulo: string; obrigatorio?: boolean; erro?: string; dica?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {rotulo}
        {obrigatorio && <span className="text-atraso">*</span>}
      </Label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="text-atraso text-xs">
          {erro}
        </p>
      ) : dica ? (
        <p className="text-muted-foreground text-xs">{dica}</p>
      ) : null}
    </div>
  );
}

export function FormularioCliente({ valores = {}, cancelarHref }: { valores?: ValoresCliente; cancelarHref: string }) {
  const [estado, acao, pendente] = useActionState<EstadoCliente | null, FormData>(salvarCliente, null);
  const router = useRouter();
  // Arquivos escolhidos no cadastro: enviados depois que o cliente existe (precisa do id).
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [envio, setEnvio] = useState<ItemEnvio[]>([]);
  const inputArquivos = useRef<HTMLInputElement>(null);
  const criadoId = estado?.criadoId;
  useEffect(() => {
    if (!criadoId) return;
    void (async () => {
      const itens = arquivos.length ? await enviarDocumentos(criadoId, arquivos, setEnvio) : [];
      const falhas = itens.filter((i) => i.estado === 'erro').length;
      router.push(`/clientes/${criadoId}?criado=1${falhas ? `&falhas=${falhas}` : ''}`);
    })();
  }, [criadoId]);
  const e = estado?.campos ?? {};
  // Depois de um envio com erro, reexibe o que foi digitado (o React limpa o form após a action).
  const v = estado?.valores;
  const val = {
    nome: v?.nome ?? valores.nome,
    tipoDocumento: (v?.tipo_documento as ValoresCliente['tipoDocumento']) ?? valores.tipoDocumento ?? 'auto',
    documento: v?.documento ?? valores.documento,
    telefone: v?.telefone ?? valores.telefone,
    apelidos: v?.apelidos ?? valores.apelidos,
    observacoes: v?.observacoes ?? valores.observacoes,
  };
  const invalido = (k: keyof typeof e) => (e[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-erro` } : {});

  return (
    <form key={estado?.envio ?? 0} action={acao} className="space-y-6" noValidate>
      {valores.id && <input type="hidden" name="id" value={valores.id} />}

      {estado?.existente && (
        <div className="border-atraso-fill/30 bg-atraso-fill/10 text-atraso flex items-start gap-2 rounded-lg border p-3 text-sm" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Este documento já é de{' '}
            <Link href={`/clientes/${estado.existente.id}`} className="font-semibold underline">
              {estado.existente.nome}
            </Link>
            . Nenhum cadastro duplicado foi criado.
          </span>
        </div>
      )}
      {estado?.erro && (
        <p className="text-atraso text-sm" role="alert">
          {estado.erro}
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <Campo id="nome" rotulo="Nome completo" obrigatorio erro={e.nome}>
            <Input id="nome" name="nome" defaultValue={val.nome} autoComplete="off" placeholder="Ex.: Carlos Alberto Souza" {...invalido('nome')} />
          </Campo>
        </div>

        <Campo id="documento" rotulo="Documento" obrigatorio erro={e.documento} dica="CPF e CNPJ são validados. O documento identifica o cliente e evita cadastros duplicados.">
          <div className="flex gap-2">
            <select
              name="tipo_documento"
              defaultValue={val.tipoDocumento}
              aria-label="Tipo de documento"
              className="bg-background h-8 rounded-lg border px-2 text-sm"
            >
              <option value="auto">CPF/CNPJ</option>
              <option value="rg">RG</option>
              <option value="outro">Outro</option>
            </select>
            <Input id="documento" name="documento" defaultValue={val.documento} inputMode="text" placeholder="000.000.000-00" className="flex-1" {...invalido('documento')} />
          </div>
        </Campo>

        <Campo id="telefone" rotulo="Telefone" erro={e.telefone}>
          <TelefoneInput id="telefone" name="telefone" valorInicial={val.telefone} placeholder="(11) 99999-9999" {...invalido('telefone')} />
        </Campo>

        <div className="md:col-span-2">
          <Campo id="apelidos" rotulo="Apelidos" dica="Separados por vírgula. O bot reconhece o cliente por eles (ex.: Carlão, Carlinhos).">
            <Input id="apelidos" name="apelidos" defaultValue={val.apelidos} placeholder="Carlão, Carlinhos" />
          </Campo>
        </div>

        {!valores.id && (
          <div className="md:col-span-2">
            <Campo id="arquivos" rotulo="Documentos (PDF ou imagem)" dica="RG, CPF, comprovante de residência… Até 10 MB cada. Também dá para enviar depois, pela ficha do cliente.">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => inputArquivos.current?.click()}
                  className="hover:bg-muted/50 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-4 text-sm"
                >
                  <FileUp className="text-muted-foreground size-4" aria-hidden /> Escolher arquivos
                </button>
                <input
                  ref={inputArquivos}
                  id="arquivos"
                  type="file"
                  accept={ACCEPT}
                  multiple
                  hidden
                  onChange={(ev) => setArquivos((atual) => [...atual, ...(ev.target.files ? [...ev.target.files] : [])])}
                />
                {envio.length > 0 ? (
                  <ListaEnvio itens={envio} />
                ) : (
                  arquivos.length > 0 && (
                    <ul className="space-y-1 text-sm">
                      {arquivos.map((f, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="truncate">{f.name}</span>
                          <span className="text-muted-foreground text-xs">{formatarBytes(f.size)}</span>
                          <button type="button" className="text-muted-foreground hover:text-atraso ml-auto text-xs" onClick={() => setArquivos((a) => a.filter((_, j) => j !== i))}>
                            remover
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            </Campo>
          </div>
        )}

        <div className="md:col-span-2">
          <Campo id="observacoes" rotulo="Observações">
            <textarea
              id="observacoes"
              name="observacoes"
              defaultValue={val.observacoes}
              rows={3}
              maxLength={500}
              placeholder="Indicado por…, referência, endereço…"
              className={cn('bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-2.5 py-2 text-sm outline-none focus-visible:ring-3')}
            />
          </Campo>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t pt-5">
        <Button nativeButton={false} variant="ghost" render={<Link href={cancelarHref} />}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendente || !!criadoId}>
          {pendente || criadoId ? <Loader2 className="animate-spin" /> : <Save />}
          {valores.id ? 'Salvar alterações' : 'Cadastrar cliente'}
        </Button>
      </div>
    </form>
  );
}
