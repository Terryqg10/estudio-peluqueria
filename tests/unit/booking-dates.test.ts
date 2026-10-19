import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildDays,
  daysBetween,
  formatDayParts,
  formatLongDate,
  formatSlotTime,
  madridDateOf,
  madridHour,
  todayInMadrid,
} from '@/lib/booking/dates';

describe('fechas de la reserva (Europe/Madrid)', () => {
  it('madridDateOf convierte UTC a la fecha local, también cerca de medianoche', () => {
    expect(madridDateOf('2026-11-02T09:00:00Z')).toBe('2026-11-02');
    // 23:30 UTC en invierno son las 00:30 del día siguiente en Madrid.
    expect(madridDateOf('2026-11-02T23:30:00Z')).toBe('2026-11-03');
    // 22:30 UTC en verano (UTC+2) ya es el día siguiente.
    expect(madridDateOf('2026-07-01T22:30:00Z')).toBe('2026-07-02');
  });

  it('todayInMadrid usa la fecha local y no la de UTC', () => {
    expect(todayInMadrid(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
    expect(todayInMadrid(new Date('2026-07-01T10:00:00Z'))).toBe('2026-07-01');
  });

  it('formatSlotTime y madridHour muestran la hora local, con el cambio de hora', () => {
    expect(formatSlotTime('2026-10-24T08:00:00Z')).toBe('10:00'); // CEST, UTC+2
    expect(formatSlotTime('2026-10-25T09:00:00Z')).toBe('10:00'); // CET tras el cambio, UTC+1
    expect(madridHour('2026-10-25T09:00:00Z')).toBe(10);
  });

  it('addDays cruza mes, año y bisiestos', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-10-20', -1)).toBe('2026-10-19');
  });

  it('daysBetween cuenta días aunque haya cambio de hora', () => {
    expect(daysBetween('2026-10-20', '2026-10-27')).toBe(7);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-10-20', '2026-10-20')).toBe(0);
  });

  it('buildDays genera días consecutivos', () => {
    expect(buildDays('2026-10-30', 4)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(buildDays('2026-10-30', 0)).toEqual([]);
  });

  it('formatDayParts da día de la semana, número y mes en español', () => {
    expect(formatDayParts('2026-10-21')).toEqual({ weekday: 'mié', day: '21', month: 'oct' });
    expect(formatDayParts('2026-11-02')).toEqual({ weekday: 'lun', day: '2', month: 'nov' });
  });

  it('formatLongDate da la fecha larga en español', () => {
    expect(formatLongDate('2026-10-21')).toBe('miércoles, 21 de octubre');
  });
});
