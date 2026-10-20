import { dataValida, somarMeses } from './datas';
import type { DataISO } from './tipos';

/**
 * Interpreta datas digitadas: "15/12", "15/12/2026", "15/12/26", "dia 30", "30", "2026-12-15".
 * Sem ano (ou só dia), escolhe a próxima ocorrência a partir de `hoje` (inclusive);
 * com `direcao = 'passado'`, a ocorrência mais recente até hoje (ex.: data de um pagamento).
 */
export function parseDataCurta(
  texto: string,
  hoje: DataISO,
  direcao: 'futuro' | 'passado' = 'futuro',
): DataISO | null {
  const t = texto.trim().toLowerCase().replace(/^dia\s+/, '');
  if (dataValida(t)) return t;

  const [anoHoje, mesHoje] = hoje.split('-').map(Number) as [number, number];
  const pad = (n: number) => String(n).padStart(2, '0');

  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
  if (m) {
    const ano = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = `${ano}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
    return dataValida(d) ? d : null;
  }

  m = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (m && direcao === 'passado') {
    for (const ano of [anoHoje, anoHoje - 1]) {
      const d = `${ano}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
      if (dataValida(d) && d <= hoje) return d;
    }
    return null;
  }
  if (m) {
    for (const ano of [anoHoje, anoHoje + 1]) {
      const d = `${ano}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
      if (dataValida(d) && d >= hoje) return d;
    }
    return null;
  }

  m = /^(\d{1,2})$/.exec(t);
  if (m) {
    const dia = Number(m[1]);
    if (dia < 1 || dia > 31) return null;
    // Próximo mês que tenha esse dia, a partir do atual (sempre existe em até 3 meses).
    const candidatos = [0, 1, 2].map(
      (i) => `${somarMeses(`${anoHoje}-${pad(mesHoje)}-01`, i).slice(0, 8)}${pad(dia)}`,
    );
    return candidatos.find((d) => dataValida(d) && d >= hoje) ?? null;
  }
  return null;
}

/** Minúsculas, sem acentos e espaços extras — para comparar nomes. */
export function normalizarNome(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ClienteParaResolver {
  id: string;
  nome: string;
  apelidos: readonly string[];
}

export type ResolucaoCliente<T extends ClienteParaResolver> =
  | { tipo: 'unico'; cliente: T }
  | { tipo: 'ambiguo'; opcoes: T[] }
  | { tipo: 'nenhum' };

/**
 * Resolve um nome digitado contra a lista de clientes, sem chutar:
 * nome completo ou apelido exato → único; primeiro nome / prefixo → único se só um bate;
 * mais de um candidato → ambíguo (o bot pergunta).
 */
export function resolverCliente<T extends ClienteParaResolver>(
  termo: string,
  clientes: readonly T[],
): ResolucaoCliente<T> {
  const alvo = normalizarNome(termo);
  if (!alvo) return { tipo: 'nenhum' };

  const exatos = clientes.filter(
    (c) => normalizarNome(c.nome) === alvo || c.apelidos.some((a) => normalizarNome(a) === alvo),
  );
  if (exatos.length === 1) return { tipo: 'unico', cliente: exatos[0]! };
  if (exatos.length > 1) return { tipo: 'ambiguo', opcoes: exatos };

  const parciais = clientes.filter((c) => {
    const nome = normalizarNome(c.nome);
    const palavras = nome.split(' ');
    return palavras.includes(alvo) || nome.startsWith(`${alvo} `) || (alvo.length >= 3 && nome.startsWith(alvo));
  });
  if (parciais.length === 1) return { tipo: 'unico', cliente: parciais[0]! };
  if (parciais.length > 1) return { tipo: 'ambiguo', opcoes: parciais };
  return { tipo: 'nenhum' };
}
