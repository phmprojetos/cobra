import { ErroRegra } from './erros';
import type { Centavos } from './tipos';

export function assertCentavos(valor: number, campo = 'valor'): asserts valor is Centavos {
  if (!Number.isSafeInteger(valor)) {
    throw new ErroRegra('centavos_invalidos', `${campo} deve ser um inteiro em centavos`);
  }
}

export function soma(valores: readonly Centavos[]): Centavos {
  return valores.reduce((a, b) => a + b, 0);
}

/**
 * Divide `total` em `n` partes iguais; a diferença de centavos fica na última.
 * Ex.: 100 / 3 → [33, 33, 34].
 */
export function dividirIgual(total: Centavos, n: number): Centavos[] {
  assertCentavos(total, 'total');
  if (!Number.isInteger(n) || n < 1) {
    throw new ErroRegra('parcelas_invalidas', 'Número de parcelas deve ser ≥ 1');
  }
  const base = Math.trunc(total / n);
  const partes = Array.from({ length: n }, () => base);
  partes[n - 1] = total - base * (n - 1);
  return partes;
}

/**
 * Converte texto digitado ("2.400,50", "2400.5", "R$ 1.200", "1200") em centavos.
 * Retorna null se não reconhecer.
 */
export function parseValor(texto: string): Centavos | null {
  let s = texto.replace(/[^\d.,-]/g, '');
  if (!s || s === '-' || /-/.test(s.slice(1))) return null;
  const negativo = s.startsWith('-');
  if (negativo) s = s.slice(1);

  const ultimaVirgula = s.lastIndexOf(',');
  const ultimoPonto = s.lastIndexOf('.');
  let inteiro: string;
  let decimal = '';
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    // O separador que aparece por último é o decimal.
    const sep = ultimaVirgula > ultimoPonto ? ',' : '.';
    const idx = s.lastIndexOf(sep);
    inteiro = s.slice(0, idx).replace(/[.,]/g, '');
    decimal = s.slice(idx + 1);
  } else if (ultimaVirgula >= 0 || ultimoPonto >= 0) {
    const sep = ultimaVirgula >= 0 ? ',' : '.';
    const partes = s.split(sep);
    const ultima = partes[partes.length - 1] ?? '';
    // "1.200" / "1,200.000" → milhar; "1,5" / "2400.50" → decimal.
    if (partes.length === 2 && ultima.length !== 3) {
      inteiro = partes[0] ?? '';
      decimal = ultima;
    } else {
      inteiro = partes.join('');
    }
  } else {
    inteiro = s;
  }
  if (!/^\d+$/.test(inteiro || '0') || !/^\d{0,2}$/.test(decimal)) return null;
  const centavos = Number(inteiro || '0') * 100 + Number(decimal.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(centavos)) return null;
  return negativo ? -centavos : centavos;
}

export interface OpcoesMoeda {
  moeda: string;
  locale: string;
}

export function formatarMoeda(valor: Centavos, { moeda, locale }: OpcoesMoeda): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: moeda }).format(valor / 100);
}

export function formatarPercentual(taxa: number, locale: string, casas = 2): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(taxa);
}
