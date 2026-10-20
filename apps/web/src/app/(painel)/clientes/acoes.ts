'use server';

import { ErroRegra, mascararTelefone, parseDocumento, telefoneValido, type Documento } from '@cobra/core';
import { Repositorio } from '@cobra/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { MODO_DEMO } from '@/lib/demo';
import { dbPainel } from '@/lib/supabase/painel';

export interface EstadoCliente {
  erro?: string;
  campos?: Partial<Record<'nome' | 'documento' | 'telefone', string>>;
  /** Documento já pertence a outro cliente. */
  existente?: { id: string; nome: string };
  /** O que foi digitado, para não apagar o formulário quando há erro. */
  valores?: Record<string, string>;
  /** Muda a cada envio: remonta o formulário com os valores devolvidos. */
  envio?: number;
}

interface Dados {
  nome: string;
  documento: Documento;
  telefone: string | null;
  apelidos: string[];
  observacoes: string | null;
}

/** Valida o formulário com as mesmas regras do bot (nome + documento obrigatórios). */
function ler(form: FormData): { dados: Dados } | { estado: EstadoCliente } {
  const nome = String(form.get('nome') ?? '').trim().replace(/\s+/g, ' ');
  const tipo = String(form.get('tipo_documento') ?? 'auto');
  const numero = String(form.get('documento') ?? '').trim();
  const telefone = String(form.get('telefone') ?? '').trim();
  const apelidos = [...new Set(String(form.get('apelidos') ?? '').split(',').map((a) => a.trim()).filter(Boolean))];
  const observacoes = String(form.get('observacoes') ?? '').trim().slice(0, 500);

  const campos: EstadoCliente['campos'] = {};
  if (!/^[\p{L}][\p{L}\s.'-]{1,80}$/u.test(nome)) campos.nome = 'Informe o nome completo (só letras).';
  const doc = numero ? parseDocumento(tipo === 'auto' ? numero : `${tipo} ${numero}`) : { erro: 'Informe o documento.' };
  if ('erro' in doc) campos.documento = doc.erro.replace(/<[^>]+>/g, '');
  if (telefone && !telefoneValido(telefone)) campos.telefone = 'Telefone incompleto: DDD + número, ex.: (11) 99999-9999.';
  if (Object.keys(campos).length || 'erro' in doc) return { estado: { campos } };
  return { dados: { nome, documento: doc, telefone: telefone ? mascararTelefone(telefone) : null, apelidos, observacoes: observacoes || null } };
}

export async function salvarCliente(anterior: EstadoCliente | null, form: FormData): Promise<EstadoCliente> {
  const valores = Object.fromEntries(['nome', 'tipo_documento', 'documento', 'telefone', 'apelidos', 'observacoes'].map((k) => [k, String(form.get(k) ?? '')]));
  const envio = (anterior?.envio ?? 0) + 1;
  const res = await processar(form);
  return { ...res, valores, envio };
}

async function processar(form: FormData): Promise<EstadoCliente> {
  if (MODO_DEMO) return { erro: 'Indisponível no modo demonstração.' };
  const lido = ler(form);
  if ('estado' in lido) return lido.estado;
  const { dados } = lido;
  const id = String(form.get('id') ?? '') || null;
  const repo = new Repositorio(await dbPainel());

  const dono = await repo.clientePorDocumento(dados.documento);
  if (dono && dono.id !== id) return { existente: { id: dono.id, nome: dono.nome }, campos: { documento: 'Documento já cadastrado.' } };

  let destino: string;
  try {
    if (id) {
      await repo.atualizarCliente(id, dados);
      destino = `/clientes/${id}?salvo=1`;
    } else {
      const novo = await repo.criarCliente(dados);
      destino = `/clientes/${novo.id}?criado=1`;
    }
  } catch (e) {
    if (e instanceof ErroRegra) return { erro: e.message };
    throw e;
  }
  revalidatePath('/clientes');
  redirect(destino);
}
