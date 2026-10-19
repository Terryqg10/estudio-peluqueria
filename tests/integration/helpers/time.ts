// Utilidades de hora para los tests: el salón trabaja en Europe/Madrid, la BD guarda UTC.

const hourInMadrid = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  hour: '2-digit',
  hour12: false,
});

// Primer domingo (fecha UTC) con al menos `minDays` días de margen, como YYYY-MM-DD.
export function sundayDateAhead(minDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + minDays);
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Instante UTC (ISO) de una hora local de Madrid en una fecha dada, incluido el cambio de hora.
export function madridInstant(date: string, hour: number, minute = 0): string {
  const [y, m, d] = date.split('-').map(Number);
  const guess = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hour, minute));
  const shift = Number(hourInMadrid.format(guess)) - hour; // 1 o 2 horas
  return new Date(guess.getTime() - shift * 3_600_000).toISOString();
}
