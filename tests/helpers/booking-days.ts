import { addDays, todayInMadrid } from '../../src/lib/booking/dates';

// Primer día de los próximos 14 que cumple `accept` (día de la semana ISO: 1 = lunes … 7 = domingo).
export function nextDay(minAhead: number, accept: (isoWeekday: number) => boolean): string {
  const today = todayInMadrid();
  for (let i = minAhead; i < 14; i++) {
    const date = addDays(today, i);
    const isoWeekday = ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    if (accept(isoWeekday)) return date;
  }
  throw new Error('sin día candidato en los próximos 14');
}

export const workday = () => nextDay(3, (d) => d <= 5); // lunes a viernes, abierto 10:00–20:00
export const sunday = () => nextDay(2, (d) => d === 7); // cerrado: sin huecos
