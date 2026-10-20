import {
  diaSemana,
  formatarMoeda,
  formatarPercentual,
  type Centavos,
  type DataISO,
  type ParcelaPlano,
} from '@cobra/core';
import type { Configuracao } from '@cobra/db';

const DIAS_CURTOS = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

export function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class Formatador {
  constructor(private readonly config: Pick<Configuracao, 'moeda' | 'locale'>) {}

  dinheiro(v: Centavos): string {
    return formatarMoeda(v, this.config).replace(/ /g, ' ');
  }

  pct(taxa: number): string {
    return formatarPercentual(taxa, this.config.locale).replace(/ /g, ' ');
  }

  /** 15/12 (ter) — inclui o ano só se for diferente do ano de referência. */
  data(d: DataISO, anoRef?: string): string {
    const [a, m, dia] = d.split('-');
    const ano = anoRef && a !== anoRef ? `/${a}` : '';
    return `${dia}/${m}${ano} (${DIAS_CURTOS[diaSemana(d)]})`;
  }

  parcelas(ps: readonly ParcelaPlano[], anoRef: string): string {
    if (ps.length === 1) return `Vencimento: <b>${this.data(ps[0]!.vencimento, anoRef)}</b>`;
    return ps.map((p) => `  ${p.numero}. ${this.data(p.vencimento, anoRef)} — ${this.dinheiro(p.valor)}`).join('\n');
  }
}

export interface Botao {
  texto: string;
  /** callback_data (botões de ação). */
  dados: string;
  /** Se presente, o botão é um link (usado no canal de alertas). */
  url?: string;
  /** Se presente, o botão copia este texto para a área de transferência (copy_text). */
  copiar?: string;
}

export interface Resposta {
  texto: string;
  teclado?: Botao[][];
  /** Substitui a mensagem onde o botão foi clicado (callbacks). */
  editarOriginal?: boolean;
}

export const BOTOES_CONFIRMACAO = (sessaoId: string): Botao[][] => [
  [
    { texto: '✅ Confirmar', dados: `ok:${sessaoId}` },
    { texto: '✏️ Editar', dados: `ed:${sessaoId}` },
    { texto: '❌ Cancelar', dados: `x:${sessaoId}` },
  ],
];

export const TEXTO_AJUDA = `<b>Como usar</b>
Escreva normalmente, por exemplo:
• <i>emprestei 2000 pro Carlos, volta 2400 dia 15/12</i>
• <i>Ana pegou 500, paga 600 em 4x semanais começando sexta</i>
• <i>Carlos pagou 1200</i>
• <i>joga o vencimento do Carlos pro dia 30 com mais 100</i>
• <i>quanto entra essa semana?</i> · <i>quem tá atrasado?</i> · <i>saldo da Ana</i> · <i>liste os clientes</i>

Nada é gravado sem você confirmar ✅.

<b>Atalhos (sem IA)</b>
/novo <code>nome valor total vencimento [4x] [semanal|quinzenal|mensal]</code>
/pagar <code>nome valor [data]</code>
/hoje — vencimentos de hoje e atrasados
/semana — a receber nesta semana
/atrasados — lista de atrasados
/clientes <code>[filtro]</code> — lista com nome e documento
/cliente <code>nome ou documento</code> — ficha do cliente
/editar <code>[nome ou documento]</code> — corrigir nome, apelidos, telefone, documento
/resumo — visão geral da carteira
/canal — canal de alertas (status e teste)
/ajuda — esta mensagem`;
