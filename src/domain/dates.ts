import type { ISODate } from './types';

const DAY = 86_400_000;

function toUTC(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * DAY);
}

/** b − a, en jours. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY);
}

export function todayISO(now = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 0 = lundi … 6 = dimanche */
export function weekday(d: ISODate): number {
  return (new Date(toUTC(d)).getUTCDay() + 6) % 7;
}

export function startOfWeek(d: ISODate): ISODate {
  return addDays(d, -weekday(d));
}

export function range(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('fr-FR', { ...opts, timeZone: 'UTC' });

const longFmt = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const shortFmt = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const dayMonthFmt = fmt({ day: 'numeric', month: 'short' });
const weekdayFmt = fmt({ weekday: 'long' });

export const formatLong = (d: ISODate) => longFmt.format(toUTC(d));
export const formatShort = (d: ISODate) => shortFmt.format(toUTC(d)).replace(/\./g, '');
export const formatDayMonth = (d: ISODate) => dayMonthFmt.format(toUTC(d)).replace(/\./g, '');
export const formatWeekday = (d: ISODate) => weekdayFmt.format(toUTC(d));
/** « 16/11/26 » : la date courte des en-têtes. */
export const formatNumeric = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;

/** « aujourd'hui », « demain », « dans 3 j », « il y a 2 j » */
export function relative(from: ISODate, to: ISODate): string {
  const n = diffDays(from, to);
  if (n === 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  if (n === -1) return 'hier';
  if (n > 1) return `dans ${n} j`;
  return `il y a ${-n} j`;
}
