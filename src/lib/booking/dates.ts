// Fechas de la reserva. El salón trabaja en Europe/Madrid; la BD guarda UTC (RNF-08).
// Las fechas «locales» se manejan como cadenas YYYY-MM-DD, sin objetos Date ambiguos.

export const TIME_ZONE = 'Europe/Madrid';
export const MAX_DAYS_AHEAD = 60; // ventana de reserva (ADR-0013, VERIFICAR con el salón)

const isoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormat = new Intl.DateTimeFormat('es-ES', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const hourFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  hour12: false,
});

export function madridDateOf(iso: string): string {
  return isoDate.format(new Date(iso));
}

export function todayInMadrid(now: Date = new Date()): string {
  return isoDate.format(now);
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function buildDays(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function formatSlotTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export function madridHour(iso: string): number {
  return Number(hourFormat.format(new Date(iso)));
}

// Se formatea el mediodía UTC de la fecha para no cruzar de día por la zona horaria.
function noonUtc(date: string): Date {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function formatDayParts(date: string): { weekday: string; day: string; month: string } {
  const d = noonUtc(date);
  const fmt = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', ...options }).format(d);
  return {
    weekday: fmt({ weekday: 'short' }).replace('.', ''),
    day: fmt({ day: 'numeric' }),
    month: fmt({ month: 'short' }).replace('.', ''),
  };
}

export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(noonUtc(date));
}
