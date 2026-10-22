import { z } from 'zod';
import { TIME_ZONE, addDays, daysBetween, madridDateOf, todayInMadrid } from '@/lib/booking/dates';

// Semana de la agenda del Admin (T-008b). Las fechas «locales» son cadenas AAAA-MM-DD en Europe/Madrid;
// la BD guarda UTC, así que los límites de la semana se convierten con cuidado en los cambios de hora.

export const MAX_WEEKS_AWAY = 53;

export const LocalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const time = Date.parse(`${value}T00:00:00Z`);
    return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
  });

// ISO: 1 = lunes … 7 = domingo.
function isoWeekday(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

// Primer instante UTC en que, en Madrid, ya es `date`. Madrid va a UTC+1 o UTC+2: se prueba cuál encaja.
export function madridMidnightUtc(date: string): Date {
  const base = new Date(`${date}T00:00:00Z`).getTime();
  for (const offsetHours of [2, 1]) {
    const candidate = new Date(base - offsetHours * 3_600_000);
    const before = new Date(candidate.getTime() - 1);
    if (madridDateOf(candidate.toISOString()) === date && madridDateOf(before.toISOString()) !== date) {
      return candidate;
    }
  }
  throw new Error(`No se pudo calcular la medianoche de ${date} en ${TIME_ZONE}`);
}

export type WeekQuery = { monday: string; day: string | null };

// `semana` y `dia` salen de la URL (entrada externa): cualquier valor no válido, o fuera de ±53 semanas,
// cae en la semana actual. `dia` solo vale si pertenece a esa semana.
export function parseWeekQuery(
  raw: { semana?: string | string[]; dia?: string | string[] },
  now: Date = new Date(),
): WeekQuery {
  const today = todayInMadrid(now);
  const currentMonday = mondayOf(today);

  const week = LocalDateSchema.safeParse(raw.semana);
  let monday = currentMonday;
  if (week.success) {
    const candidate = mondayOf(week.data);
    if (Math.abs(daysBetween(currentMonday, candidate)) <= MAX_WEEKS_AWAY * 7) monday = candidate;
  }

  const day = LocalDateSchema.safeParse(raw.dia);
  const days = weekDays(monday);
  return { monday, day: day.success && days.includes(day.data) ? day.data : null };
}

// [inicio, fin) de la semana como rango de tstzrange para `overlaps`.
export function weekRange(monday: string): { start: string; end: string } {
  return {
    start: madridMidnightUtc(monday).toISOString(),
    end: madridMidnightUtc(addDays(monday, 7)).toISOString(),
  };
}

export function weekHref(base: string, monday: string, day?: string | null): string {
  const params = new URLSearchParams({ semana: monday });
  if (day) params.set('dia', day);
  return `${base}?${params.toString()}`;
}
