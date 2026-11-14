import { diffDays } from './dates';
import type { ISODate, WeightEntry } from './types';

export interface TrendPoint {
  date: ISODate;
  kg: number;
  trend: number;
}

/**
 * Tendance lissée (moyenne mobile exponentielle, pondérée par l'écart entre pesées).
 * Une pesée isolée bouge de ±1 kg selon l'eau et le repas ; la tendance, beaucoup moins.
 */
export function weightTrend(entries: WeightEntry[], dailyAlpha = 0.1): TrendPoint[] {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: TrendPoint[] = [];
  let trend: number | undefined;
  let prev: ISODate | undefined;
  for (const e of sorted) {
    if (trend === undefined || prev === undefined) {
      trend = e.kg;
    } else {
      const gap = Math.max(1, diffDays(prev, e.date));
      const alpha = 1 - Math.pow(1 - dailyAlpha, gap);
      trend = trend + alpha * (e.kg - trend);
    }
    prev = e.date;
    out.push({ date: e.date, kg: e.kg, trend });
  }
  return out;
}

/** Variation de la tendance par semaine, sur les `days` derniers jours. */
export function weeklyRate(points: TrendPoint[], days = 28): number | undefined {
  if (points.length < 2) return undefined;
  const last = points[points.length - 1];
  const ref = points.find((p) => diffDays(p.date, last.date) <= days) ?? points[0];
  const span = diffDays(ref.date, last.date);
  if (span < 7) return undefined;
  return ((last.trend - ref.trend) / span) * 7;
}
