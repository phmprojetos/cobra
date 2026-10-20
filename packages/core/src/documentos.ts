export type TipoDocumento = 'cpf' | 'cnpj' | 'rg' | 'outro';

export interface Documento {
  tipo: TipoDocumento;
  /** Normalizado: só dígitos (CPF/CNPJ) ou letras/dígitos em maiúsculas (RG/outro). */
  numero: string;
}

const so = (s: string) => s.replace(/\D/g, '');

function digitoMod11(digitos: number[], pesos: number[]): number {
  const r = digitos.reduce((a, d, i) => a + d * pesos[i]!, 0) % 11;
  return r < 2 ? 0 : 11 - r;
}

export function cpfValido(cpf: string): boolean {
  const d = so(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const n = [...d].map(Number);
  const dv1 = digitoMod11(n.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoMod11(n.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === n[9] && dv2 === n[10];
}

export function cnpjValido(cnpj: string): boolean {
  const d = so(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const n = [...d].map(Number);
  const dv1 = digitoMod11(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoMod11(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === n[12] && dv2 === n[13];
}

/** Completa 9 dígitos com os verificadores (para dados de teste e demonstração). */
export function completarCpf(base9: string): string {
  const n = [...so(base9).padStart(9, '0').slice(-9)].map(Number);
  const dv1 = digitoMod11(n, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoMod11([...n, dv1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...n, dv1, dv2].join('');
}

export const AJUDA_DOCUMENTO =
  'Envie o CPF (ou CNPJ). Para outro documento, escreva o tipo antes: <code>RG 12.345.678-9</code> ou <code>outro 123456</code>.';

/**
 * Interpreta um documento digitado. CPF/CNPJ são reconhecidos pelos dígitos e validados;
 * RG e outros exigem o tipo escrito antes do número.
 */
export function parseDocumento(texto: string): Documento | { erro: string } {
  const t = texto.trim();
  const prefixo = /^(cpf|cnpj|rg|outro|cnh|passaporte)\s*[:\-]?\s*(.+)$/i.exec(t);
  const tipoDito = prefixo?.[1]!.toLowerCase();
  const resto = prefixo ? prefixo[2]! : t;

  if (tipoDito === 'rg' || tipoDito === 'outro' || tipoDito === 'cnh' || tipoDito === 'passaporte') {
    const numero = resto.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (numero.length < 4) return { erro: 'Documento muito curto.' };
    return { tipo: tipoDito === 'rg' ? 'rg' : 'outro', numero };
  }
  if (/[a-z]/i.test(resto)) return { erro: `Não reconheci o documento. ${AJUDA_DOCUMENTO}` };
  const d = so(resto);
  if (d.length === 11 && tipoDito !== 'cnpj') {
    return cpfValido(d) ? { tipo: 'cpf', numero: d } : { erro: 'CPF inválido (confira os dígitos).' };
  }
  if (d.length === 14 && tipoDito !== 'cpf') {
    return cnpjValido(d) ? { tipo: 'cnpj', numero: d } : { erro: 'CNPJ inválido (confira os dígitos).' };
  }
  return { erro: `Não reconheci o documento. ${AJUDA_DOCUMENTO}` };
}

export function formatarDocumento(tipo: TipoDocumento | string | null, numero: string | null): string {
  if (!tipo || !numero) return '—';
  if (tipo === 'cpf' && numero.length === 11) return numero.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (tipo === 'cnpj' && numero.length === 14) return numero.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (tipo === 'rg') return `RG ${numero}`;
  return numero;
}
