/** Regras dos documentos do cliente (valem no navegador e no servidor). */

export const TAMANHO_MAX = 10 * 1024 * 1024; // 10 MB (igual ao limite do bucket)

const POR_EXTENSAO: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};
export const TIPOS_ACEITOS = [...new Set(Object.values(POR_EXTENSAO))];
export const ACCEPT = [...TIPOS_ACEITOS, '.heic', '.heif'].join(',');

/** Tipo do arquivo: o informado pelo navegador ou, se vazio (HEIC em alguns navegadores), pela extensão. */
export function tipoDoArquivo(nome: string, tipoInformado: string): string | null {
  const t = tipoInformado.toLowerCase();
  if (TIPOS_ACEITOS.includes(t)) return t;
  const ext = nome.split('.').pop()?.toLowerCase() ?? '';
  return POR_EXTENSAO[ext] ?? null;
}

export function validarArquivo(nome: string, tipo: string, tamanho: number): string | null {
  if (!tipoDoArquivo(nome, tipo)) return `"${nome}": tipo não aceito (use PDF, JPG, PNG, WEBP ou HEIC).`;
  if (tamanho <= 0) return `"${nome}": arquivo vazio.`;
  if (tamanho > TAMANHO_MAX) return `"${nome}": maior que 10 MB.`;
  return null;
}

/** Nome seguro para o caminho no Storage (sem acentos/espaços), mantendo a extensão. */
export function nomeSeguro(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(-80);
  return base || 'arquivo';
}

export function formatarBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Imagens que o navegador consegue exibir como miniatura (HEIC só no Safari). */
export function exibivel(tipo: string): boolean {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(tipo);
}
