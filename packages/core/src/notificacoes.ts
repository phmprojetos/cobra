import {
  compararHoras,
  dataLocal,
  diaSemana,
  instanteLocal,
  somarDias,
} from './datas';
import type { Centavos, DataISO, HoraLocal, TipoRegraNotificacao } from './tipos';

export interface RegraNotificacao {
  id: string;
  tipo: TipoRegraNotificacao;
  /** Dias antes (lembrete_antes) ou depois (atraso) do vencimento. */
  offsetDias: number;
  horario: HoraLocal;
  /** Para resumo_semanal: 1 = segunda … 7 = domingo. */
  diaSemana: number | null;
  ativo: boolean;
  silenciarClientes: readonly string[];
}

export interface HorarioSilencio {
  inicio: HoraLocal;
  fim: HoraLocal;
}

export interface ParcelaParaAlerta {
  id: string;
  clienteId: string;
  vencimento: DataISO;
  saldo: Centavos;
}

export type Alerta =
  | { tipo: 'parcela'; regra: RegraNotificacao; parcelaId: string; dataReferencia: DataISO }
  | {
      /** Mensagens diárias/semanais da carteira (não ligadas a uma parcela). */
      tipo: 'resumo_diario' | 'resumo_semanal' | 'lista_atrasados';
      regra: RegraNotificacao;
      parcelaId: null;
      dataReferencia: DataISO;
    };

export function chaveAlerta(regraId: string, parcelaId: string | null, data: DataISO): string {
  return `${regraId}|${parcelaId ?? ''}|${data}`;
}

/** Atraso máximo tolerado para disparar um alerta (ex.: job fora do ar). Depois disso, descarta. */
export const JANELA_MAXIMA_MS = 6 * 3_600_000;

export function emSilencio(hora: HoraLocal, silencio: HorarioSilencio | null): boolean {
  if (!silencio || silencio.inicio === silencio.fim) return false;
  const { inicio, fim } = silencio;
  // Janela que cruza a meia-noite (ex.: 22:00–08:00).
  if (compararHoras(inicio, fim) > 0) {
    return compararHoras(hora, inicio) >= 0 || compararHoras(hora, fim) < 0;
  }
  return compararHoras(hora, inicio) >= 0 && compararHoras(hora, fim) < 0;
}

/**
 * Instante em que a regra deve disparar para o dia-base `data`.
 * Se o horário cai no silêncio, é adiado para o fim do silêncio (não descartado).
 */
export function instanteDisparo(
  data: DataISO,
  horario: HoraLocal,
  silencio: HorarioSilencio | null,
  timezone: string,
): Date {
  if (!silencio || !emSilencio(horario, silencio)) return instanteLocal(data, horario, timezone);
  const cruzaMeiaNoite = compararHoras(silencio.inicio, silencio.fim) > 0;
  const diaFim = cruzaMeiaNoite && compararHoras(horario, silencio.inicio) >= 0 ? somarDias(data, 1) : data;
  return instanteLocal(diaFim, silencio.fim, timezone);
}

function vencimentoAlvo(
  tipo: 'lembrete_antes' | 'no_dia' | 'atraso',
  offsetDias: number,
  dataBase: DataISO,
): DataISO {
  if (tipo === 'lembrete_antes') return somarDias(dataBase, offsetDias);
  if (tipo === 'atraso') return somarDias(dataBase, -offsetDias);
  return dataBase;
}

export interface EntradaAvaliacao {
  agora: Date;
  timezone: string;
  silencio: HorarioSilencio | null;
  regras: readonly RegraNotificacao[];
  /** Parcelas com saldo em aberto (de operações em aberto). */
  parcelas: readonly ParcelaParaAlerta[];
  /** Chaves de `chaveAlerta` já enviadas. */
  enviadas: ReadonlySet<string>;
}

/**
 * Decide quais alertas devem ser enviados agora. Pura e idempotente:
 * chamada a cada 15 minutos, nunca devolve um alerta já presente em `enviadas`.
 * Avalia o dia de hoje e o de ontem para cobrir alertas adiados pelo silêncio
 * que atravessam a meia-noite.
 */
export function avaliarNotificacoes(e: EntradaAvaliacao): Alerta[] {
  const hoje = dataLocal(e.agora, e.timezone);
  const diasBase = [somarDias(hoje, -1), hoje];
  const agoraMs = e.agora.getTime();
  const alertas: Alerta[] = [];

  for (const regra of e.regras) {
    if (!regra.ativo) continue;
    for (const dataBase of diasBase) {
      const disparo = instanteDisparo(dataBase, regra.horario, e.silencio, e.timezone).getTime();
      if (agoraMs < disparo || agoraMs - disparo > JANELA_MAXIMA_MS) continue;

      if (regra.tipo === 'resumo_diario' || regra.tipo === 'resumo_semanal' || regra.tipo === 'lista_atrasados') {
        if (regra.tipo === 'resumo_semanal' && diaSemana(dataBase) !== (regra.diaSemana ?? 1)) {
          continue;
        }
        if (!e.enviadas.has(chaveAlerta(regra.id, null, dataBase))) {
          alertas.push({ tipo: regra.tipo, regra, parcelaId: null, dataReferencia: dataBase });
        }
        continue;
      }

      const alvo = vencimentoAlvo(regra.tipo, regra.offsetDias, dataBase);
      const silenciados = new Set(regra.silenciarClientes);
      for (const p of e.parcelas) {
        if (p.vencimento !== alvo || p.saldo <= 0 || silenciados.has(p.clienteId)) continue;
        if (e.enviadas.has(chaveAlerta(regra.id, p.id, dataBase))) continue;
        alertas.push({ tipo: 'parcela', regra, parcelaId: p.id, dataReferencia: dataBase });
      }
    }
  }
  return alertas;
}
