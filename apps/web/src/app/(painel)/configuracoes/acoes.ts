'use server';

import { revalidatePath } from 'next/cache';
import { fonteDemo, MODO_DEMO } from '@/lib/demo';
import { dbPainel } from '@/lib/supabase/painel';

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIPOS = ['lembrete_antes', 'no_dia', 'atraso', 'resumo_diario', 'resumo_semanal', 'lista_atrasados', 'lista_amanha'] as const;

function valido(fn: () => unknown): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

export async function salvarGeral(_: Resultado | null, form: FormData): Promise<Resultado> {
  const moeda = String(form.get('moeda') ?? '').trim().toUpperCase();
  const locale = String(form.get('locale') ?? '').trim();
  const timezone = String(form.get('timezone') ?? '').trim();
  const estrategia = String(form.get('estrategia') ?? 'proporcional');
  const silencioAtivo = form.get('silencio_ativo') === 'on';
  const inicio = String(form.get('silencio_inicio') ?? '');
  const fim = String(form.get('silencio_fim') ?? '');

  if (!valido(() => new Intl.NumberFormat(locale, { style: 'currency', currency: moeda }))) {
    return { ok: false, mensagem: 'Moeda ou locale inválidos (ex.: BRL e pt-BR).' };
  }
  if (!valido(() => new Intl.DateTimeFormat('en', { timeZone: timezone }))) {
    return { ok: false, mensagem: 'Timezone inválido (ex.: America/Sao_Paulo).' };
  }
  if (silencioAtivo && (!HORA.test(inicio) || !HORA.test(fim))) {
    return { ok: false, mensagem: 'Horário de silêncio inválido.' };
  }
  if (MODO_DEMO) {
    fonteDemo.salvarConfig({
      moeda,
      locale,
      timezone,
      estrategiaAlocacao: estrategia === 'juros_primeiro' ? 'juros_primeiro' : 'proporcional',
      silencio: silencioAtivo ? { inicio, fim } : null,
    });
    revalidatePath('/', 'layout');
    return { ok: true, mensagem: 'Configurações salvas (modo demonstração).' };
  }
  const db = await dbPainel();
  const { error } = await db.from('configuracoes').upsert([
    { chave: 'moeda', valor: moeda },
    { chave: 'locale', valor: locale },
    { chave: 'timezone', valor: timezone },
    { chave: 'estrategia_alocacao', valor: estrategia === 'juros_primeiro' ? 'juros_primeiro' : 'proporcional' },
    // `false` = silêncio desligado (a coluna jsonb não aceita null)
    { chave: 'horario_silencio', valor: silencioAtivo ? { inicio, fim } : false },
  ]);
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath('/', 'layout');
  return { ok: true, mensagem: 'Configurações salvas.' };
}

function lerRegra(form: FormData) {
  const tipo = String(form.get('tipo')) as (typeof TIPOS)[number];
  const horario = String(form.get('horario') ?? '');
  const offset = Number(form.get('offset_dias') ?? 0);
  const dia = form.get('dia_semana') ? Number(form.get('dia_semana')) : null;
  if (!TIPOS.includes(tipo)) throw new Error('Tipo inválido');
  if (!HORA.test(horario)) throw new Error('Horário inválido');
  if (!Number.isInteger(offset) || offset < 0 || offset > 90) throw new Error('Dias deve ser entre 0 e 90');
  return {
    tipo,
    horario,
    offset_dias: tipo === 'lista_amanha' ? 1 : tipo === 'no_dia' || tipo === 'lista_atrasados' || tipo.startsWith('resumo') ? 0 : offset,
    dia_semana: tipo === 'resumo_semanal' ? (dia ?? 1) : null,
    ativo: form.get('ativo') === 'on',
    silenciar_clientes: form.getAll('silenciar').map(String).filter(Boolean),
  };
}

export async function salvarRegra(_: Resultado | null, form: FormData): Promise<Resultado> {
  try {
    const id = String(form.get('id') ?? '');
    const dados = lerRegra(form);
    if (MODO_DEMO) {
      fonteDemo.salvarRegra(id || null, { ...dados, horario: `${dados.horario}:00` });
      revalidatePath('/configuracoes');
      return { ok: true, mensagem: 'Regra salva (modo demonstração).' };
    }
    const db = await dbPainel();
    const { error } = id
      ? await db.from('regras_notificacao').update(dados).eq('id', id)
      : await db.from('regras_notificacao').insert(dados);
    if (error) return { ok: false, mensagem: error.message };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }
  revalidatePath('/configuracoes');
  return { ok: true, mensagem: 'Regra salva.' };
}
