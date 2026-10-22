import { describe, expect, it } from 'vitest';
import { ScheduleSchema, ScopeSchema, TIME_OPTIONS, WEEKDAYS } from '@/lib/admin/schedules';

const day = (weekday: number, starts: string, ends: string) => ({ weekday, starts, ends });

describe('horarios semanales del Admin (T-009c)', () => {
  it('acepta un horario normal, con varios tramos por día y días libres', () => {
    const schedule = [day(1, '10:00', '14:00'), day(1, '16:00', '20:00'), day(6, '10:00', '14:00')];
    expect(ScheduleSchema.safeParse(schedule).success).toBe(true);
    expect(ScheduleSchema.safeParse([]).success).toBe(true); // todos los días libres
  });

  it('dos tramos que se tocan (14:00 y 14:00) no se solapan; el mismo hueco en días distintos tampoco', () => {
    expect(ScheduleSchema.safeParse([day(7, '10:00', '14:00'), day(7, '14:00', '18:00')]).success).toBe(true);
    expect(ScheduleSchema.safeParse([day(6, '10:00', '14:00'), day(7, '10:00', '14:00')]).success).toBe(true);
  });

  it('rechaza solapes y dice el día', () => {
    const result = ScheduleSchema.safeParse([day(3, '10:00', '14:00'), day(3, '13:45', '18:00')]);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0]?.message).toBe('Miércoles: los tramos no pueden solaparse');
  });

  it('rechaza inicio igual o posterior al fin y dice el día', () => {
    for (const range of [day(2, '14:00', '14:00'), day(2, '16:00', '10:00')]) {
      const result = ScheduleSchema.safeParse([range]);
      expect(result.success).toBe(false);
      expect(result.success ? '' : result.error.issues[0]?.message).toBe(
        'Martes: la hora de fin debe ser posterior a la de inicio',
      );
    }
  });

  it('rechaza días fuera de 1–7, horas fuera de la rejilla de 15 minutos y formatos raros', () => {
    const bad: unknown[] = [
      [day(0, '10:00', '14:00')],
      [day(8, '10:00', '14:00')],
      [day(1.5, '10:00', '14:00')],
      [day(1, '10:05', '14:00')],
      [day(1, '10:00', '24:00')],
      [day(1, '9:00', '14:00')],
      [{ weekday: '1', starts: '10:00', ends: '14:00' }],
      [{ weekday: 1, starts: '10:00' }],
      'no es un array',
      [null],
    ];
    for (const value of bad) expect(ScheduleSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
  });

  it('rechaza más de 70 tramos', () => {
    const many = Array.from({ length: 71 }, () => day(1, '10:00', '11:00'));
    expect(ScheduleSchema.safeParse(many).success).toBe(false);
  });

  it('el ámbito es «salon» o un UUID', () => {
    expect(ScopeSchema.safeParse('salon').success).toBe(true);
    expect(ScopeSchema.safeParse('11111111-1111-4111-8111-111111111111').success).toBe(true);
    for (const bad of ['', 'Salon', 'todas', '123', undefined]) expect(ScopeSchema.safeParse(bad).success).toBe(false);
  });

  it('las horas ofrecidas van de 07:00 a 22:00 de 15 en 15 y los días de lunes a domingo', () => {
    expect(TIME_OPTIONS[0]).toBe('07:00');
    expect(TIME_OPTIONS[TIME_OPTIONS.length - 1]).toBe('22:00');
    expect(TIME_OPTIONS).toHaveLength(61);
    expect(WEEKDAYS[0]).toBe('Lunes');
    expect(WEEKDAYS[6]).toBe('Domingo');
  });
});
