'use server';

import { randomUUID } from 'node:crypto';
import { Repositorio } from '@cobra/db';
import { revalidatePath } from 'next/cache';
import { MODO_DEMO } from '@/lib/demo';
import { nomeSeguro, tipoDoArquivo, TAMANHO_MAX, validarArquivo } from '@/lib/documentos';
import { dbPainel } from '@/lib/supabase/painel';

const UUID = /^[0-9a-f-]{36}$/;

async function repo() {
  return new Repositorio(await dbPainel());
}

/** Passo 1: valida e devolve uma URL de envio assinada (o navegador envia direto ao Storage). */
export async function prepararEnvio(clienteId: string, nome: string, tipo: string, tamanho: number): Promise<{ caminho: string; token: string; tipo: string } | { erro: string }> {
  if (MODO_DEMO) return { erro: 'Indisponível no modo demonstração.' };
  if (!UUID.test(clienteId)) return { erro: 'Cliente inválido.' };
  const erro = validarArquivo(nome, tipo, tamanho);
  if (erro) return { erro };
  const r = await repo();
  if (!(await r.cliente(clienteId))) return { erro: 'Cliente não encontrado.' };
  const envio = await r.prepararEnvioDocumento(`${clienteId}/${randomUUID()}-${nomeSeguro(nome)}`);
  return { ...envio, tipo: tipoDoArquivo(nome, tipo)! };
}

/** Passo 2: confere no Storage que o arquivo chegou (tamanho/tipo reais) e registra no cliente. */
export async function confirmarEnvio(clienteId: string, caminho: string, nome: string): Promise<{ ok: true } | { erro: string }> {
  if (MODO_DEMO) return { erro: 'Indisponível no modo demonstração.' };
  if (!UUID.test(clienteId) || !caminho.startsWith(`${clienteId}/`) || caminho.includes('..')) return { erro: 'Envio inválido.' };
  const r = await repo();
  const meta = await r.metadadosArquivo(caminho);
  if (!meta) return { erro: `"${nome}" não chegou ao armazenamento. Tente de novo.` };
  const tipo = tipoDoArquivo(nome, meta.tipo);
  if (!tipo || meta.tamanho > TAMANHO_MAX) return { erro: `"${nome}" foi recusado (tipo ou tamanho).` };
  await r.registrarDocumento({ clienteId, caminho, nome: nome.slice(0, 200), tipo, tamanho: meta.tamanho });
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

export async function removerDocumento(clienteId: string, documentoId: string): Promise<void> {
  if (MODO_DEMO || !UUID.test(clienteId) || !UUID.test(documentoId)) return;
  await (await repo()).removerDocumento(documentoId, clienteId);
  revalidatePath(`/clientes/${clienteId}`);
}
