import { ErroRegra } from './erros';
import type { DataISO, HoraLocal } from './tipos';

/**
 * Datas de calendário (`YYYY-MM-DD`) são manipuladas como dias UTC puros,
 * sem hora. O timezone só entra ao converter um instante (Date) em data/hora local.
 */

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_DIA = 86_400_000;

export function dataValida(data: string): data is DataISO {
  const m = RE_DATA.exec(data);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === data;
}

function assertData(data: string): asserts data is DataISO {
  if (!dataValida(data)) throw new ErroRegra('data_invalida', `Data inválida: ${data}`);
}

export function assertHora(hora: string): asserts hora is HoraLocal {
  if (!RE_HORA.test(hora)) throw new ErroRegra('hora_invalida', `Horário inválido: ${hora}`);
}

function paraUTC(data: DataISO): Date {
  assertData(data);
  return new Date(`${data}T00:00:00Z`);
}

function deUTC(d: Date): DataISO {
  return d.toISOString().slice(0, 10);
}

export function somarDias(data: DataISO, dias: number): DataISO {
  return deUTC(new Date(paraUTC(data).getTime() + dias * MS_DIA));
}

/** Soma meses mantendo o dia; se o mês não tiver o dia, usa o último (31/01 + 1 → 28/02). */
export function somarMeses(data: DataISO, meses: number): DataISO {
  const d = paraUTC(data);
  const ano = d.getUTCFullYear();
  const mes = d.getUTCMonth() + meses;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return deUTC(new Date(Date.UTC(ano, mes, Math.min(d.getUTCDate(), ultimoDia))));
}

/** Dias de `de` até `ate` (positivo se `ate` é posterior). */
export function diferencaDias(de: DataISO, ate: DataISO): number {
  return Math.round((paraUTC(ate).getTime() - paraUTC(de).getTime()) / MS_DIA);
}

/** 1 = segunda … 7 = domingo (ISO). */
export function diaSemana(data: DataISO): number {
  const d = paraUTC(data).getUTCDay();
  return d === 0 ? 7 : d;
}

export function inicioSemana(data: DataISO): DataISO {
  return somarDias(data, 1 - diaSemana(data));
}

export function compararDatas(a: DataISO, b: DataISO): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function dentroDoPeriodo(data: DataISO, inicio: DataISO, fim: DataISO): boolean {
  return data >= inicio && data <= fim;
}

const formatadores = new Map<string, Intl.DateTimeFormat>();

function partesLocais(instante: Date, timezone: string) {
  let fmt = formatadores.get(timezone);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      throw new ErroRegra('timezone_invalido', `Timezone inválido: ${timezone}`);
    }
    formatadores.set(timezone, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(instante).map((x) => [x.type, x.value]));
  return {
    data: `${p.year}-${p.month}-${p.day}` as DataISO,
    hora: `${p.hour}:${p.minute}` as HoraLocal,
    segundo: Number(p.second),
  };
}

/** Data de calendário do instante no timezone informado. */
export function dataLocal(instante: Date, timezone: string): DataISO {
  return partesLocais(instante, timezone).data;
}

/** Horário `HH:MM` do instante no timezone informado. */
export function horaLocal(instante: Date, timezone: string): HoraLocal {
  return partesLocais(instante, timezone).hora;
}

/**
 * Instante (UTC) correspondente à data/hora local no timezone.
 * Em horários inexistentes (pulo do horário de verão) avança para o primeiro instante válido.
 */
export function instanteLocal(data: DataISO, hora: HoraLocal, timezone: string): Date {
  assertData(data);
  assertHora(hora);
  const alvo = Date.parse(`${data}T${hora}:00Z`);
  let palpite = alvo;
  for (let i = 0; i < 3; i++) {
    const p = partesLocais(new Date(palpite), timezone);
    const visto = Date.parse(`${p.data}T${p.hora}:${String(p.segundo).padStart(2, '0')}Z`);
    const delta = alvo - visto;
    if (delta === 0) break;
    palpite += delta;
  }
  return new Date(palpite);
}

export function compararHoras(a: HoraLocal, b: HoraLocal): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
