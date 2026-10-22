import { describe, expect, it } from 'vitest';
import { addDays, todayInMadrid } from '@/lib/booking/dates';
import { BlockFormSchema, blockRange, madridDateTimeToUtc } from '@/lib/admin/time-blocks';

const STYLIST = '11111111-1111-4111-8111-111111111111';
const today = todayInMadrid();
const tomorrow = addDays(today, 1);

describe('bloqueos y vacaciones del Admin (T-009b)', () => {
  it('madridDateTimeToUtc: verano UTC+2, invierno UTC+1', () => {
    expect(madridDateTimeToUtc('2026-07-15', '14:00').toISOString()).toBe('2026-07-15T12:00:00.000Z');
    expect(madridDateTimeToUtc('2026-12-15', '14:00').toISOString()).toBe('2026-12-15T13:00:00.000Z');
    expect(madridDateTimeToUtc('2026-12-15', '00:00').toISOString()).toBe('2026-12-14T23:00:00.000Z');
    expect(madridDateTimeToUtc('2026-12-15', '23:45').toISOString()).toBe('2026-12-15T22:45:00.000Z');
  });

  it('madridDateTimeToUtc: a ambos lados del cambio de hora de octubre y de marzo de 2026', () => {
    // 25-oct-2026: termina el horario de verano a las 03:00 (pasan a ser las 02:00).
    expect(madridDateTimeToUtc('2026-10-25', '10:00').toISOString()).toBe('2026-10-25T09:00:00.000Z');
    expect(madridDateTimeToUtc('2026-10-24', '10:00').toISOString()).toBe('2026-10-24T08:00:00.000Z');
    // 29-mar-2026: empieza el horario de verano.
    expect(madridDateTimeToUtc('2026-03-29', '10:00').toISOString()).toBe('2026-03-29T08:00:00.000Z');
    expect(madridDateTimeToUtc('2026-03-28', '10:00').toISOString()).toBe('2026-03-28T09:00:00.000Z');
  });

  it('un día de vacaciones cubre de medianoche a medianoche de Madrid (25 h el día del cambio)', () => {
    const data = BlockFormSchema.parse({ kind: 'vacation', stylist: 'all', from: tomorrow, to: tomorrow, note: '' });
    const { start, end } = blockRange(data);
    expect(start.getTime()).toBeLessThan(end.getTime());
    expect([23, 24, 25]).toContain((end.getTime() - start.getTime()) / 3_600_000);

    const dst = blockRange({ ...data, from: '2026-10-25', to: '2026-10-25' });
    expect(dst.start.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(dst.end.toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });

  it('un rango de vacaciones incluye el último día', () => {
    const { start, end } = blockRange({
      kind: 'vacation',
      stylist: STYLIST,
      from: '2026-12-14',
      to: '2026-12-16',
      note: '',
    });
    expect(start.toISOString()).toBe('2026-12-13T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-16T23:00:00.000Z');
  });

  it('una franja usa la hora de Madrid del día elegido', () => {
    const { start, end } = blockRange({
      kind: 'block',
      stylist: STYLIST,
      from: '2026-12-15',
      startTime: '14:00',
      endTime: '16:00',
      note: '',
    });
    expect(start.toISOString()).toBe('2026-12-15T13:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-15T15:00:00.000Z');
  });

  it('el esquema acepta «todas» o una estilista y rechaza otros valores', () => {
    const base = { kind: 'block', from: tomorrow, startTime: '10:00', endTime: '11:00', note: '' };
    expect(BlockFormSchema.safeParse({ ...base, stylist: 'all' }).success).toBe(true);
    expect(BlockFormSchema.safeParse({ ...base, stylist: STYLIST }).success).toBe(true);
    expect(BlockFormSchema.safeParse({ ...base, stylist: 'todas' }).success).toBe(false);
    expect(BlockFormSchema.safeParse({ ...base, stylist: '' }).success).toBe(false);
  });

  it('rechaza días pasados, rangos al revés, fechas lejanas, horas fuera de la rejilla y notas largas', () => {
    const block = { kind: 'block', stylist: 'all', from: tomorrow, startTime: '10:00', endTime: '11:00', note: '' };
    const bad: Record<string, unknown>[] = [
      { from: addDays(today, -1) },
      { from: addDays(today, 400) },
      { startTime: '10:07' },
      { endTime: '25:00' },
      { endTime: '10:00' },
      { endTime: '09:00' },
      { startTime: undefined },
      { note: 'x'.repeat(201) },
      { from: '2026-02-30' },
    ];
    for (const override of bad) {
      expect(BlockFormSchema.safeParse({ ...block, ...override }).success, JSON.stringify(override)).toBe(false);
    }

    const vacation = { kind: 'vacation', stylist: 'all', from: addDays(today, 5), to: addDays(today, 7), note: '' };
    expect(BlockFormSchema.safeParse(vacation).success).toBe(true);
    for (const override of [{ to: addDays(today, 4) }, { to: undefined }, { to: addDays(today, 400) }]) {
      expect(BlockFormSchema.safeParse({ ...vacation, ...override }).success, JSON.stringify(override)).toBe(false);
    }
  });

  it('el día de hoy es válido y el mismo día de inicio y fin da un solo día de vacaciones', () => {
    expect(BlockFormSchema.safeParse({ kind: 'vacation', stylist: 'all', from: today, to: today, note: '' }).success).toBe(true);
  });
});
