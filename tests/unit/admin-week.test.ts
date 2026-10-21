import { describe, expect, it } from 'vitest';
import {
  MAX_WEEKS_AWAY,
  madridMidnightUtc,
  mondayOf,
  parseWeekQuery,
  weekDays,
  weekHref,
  weekRange,
} from '@/lib/admin/week';

// Miércoles 21 de octubre de 2026, mediodía en Madrid.
const NOW = new Date('2026-10-21T10:00:00Z');

describe('semana de la agenda del Admin (T-008b)', () => {
  it('mondayOf devuelve el lunes de cualquier día de la semana, domingo incluido', () => {
    expect(mondayOf('2026-10-19')).toBe('2026-10-19');
    expect(mondayOf('2026-10-21')).toBe('2026-10-19');
    expect(mondayOf('2026-10-25')).toBe('2026-10-19');
    expect(mondayOf('2026-10-26')).toBe('2026-10-26');
  });

  it('weekDays da siete días de lunes a domingo', () => {
    const days = weekDays('2026-10-19');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-10-19');
    expect(days[6]).toBe('2026-10-25');
  });

  it('la medianoche de Madrid es 22:00 UTC en verano y 23:00 UTC en invierno', () => {
    expect(madridMidnightUtc('2026-07-15').toISOString()).toBe('2026-07-14T22:00:00.000Z');
    expect(madridMidnightUtc('2026-12-15').toISOString()).toBe('2026-12-14T23:00:00.000Z');
  });

  it('una semana que cruza el cambio de hora mide 7 días de calendario (169 h en otoño)', () => {
    // El 25-oct-2026 termina el horario de verano: esa semana tiene 25 horas el domingo.
    const { start, end } = weekRange('2026-10-19');
    expect(start).toBe('2026-10-18T22:00:00.000Z');
    expect(end).toBe('2026-10-25T23:00:00.000Z');
    expect((Date.parse(end) - Date.parse(start)) / 3_600_000).toBe(169);
  });

  it('sin parámetros, o con parámetros no válidos, se usa la semana actual', () => {
    const current = { monday: '2026-10-19', day: null };
    expect(parseWeekQuery({}, NOW)).toEqual(current);
    expect(parseWeekQuery({ semana: 'hoy' }, NOW)).toEqual(current);
    expect(parseWeekQuery({ semana: '2026-02-30' }, NOW)).toEqual(current);
    expect(parseWeekQuery({ semana: ["2026-10-26", "2026-11-02"] }, NOW)).toEqual(current);
    expect(parseWeekQuery({ semana: '2026-10-26; drop table' }, NOW)).toEqual(current);
  });

  it('una fecha cualquiera se normaliza al lunes de su semana', () => {
    expect(parseWeekQuery({ semana: '2026-10-28' }, NOW).monday).toBe('2026-10-26');
  });

  it('fuera de ±53 semanas se usa la semana actual; el límite exacto es válido', () => {
    expect(parseWeekQuery({ semana: '2030-01-04' }, NOW).monday).toBe('2026-10-19');
    expect(parseWeekQuery({ semana: '2020-01-06' }, NOW).monday).toBe('2026-10-19');
    const edge = new Date(Date.UTC(2026, 9, 19 + MAX_WEEKS_AWAY * 7)).toISOString().slice(0, 10);
    expect(parseWeekQuery({ semana: edge }, NOW).monday).toBe(edge);
  });

  it('`dia` solo vale si pertenece a la semana mostrada', () => {
    expect(parseWeekQuery({ semana: '2026-10-19', dia: '2026-10-22' }, NOW).day).toBe('2026-10-22');
    expect(parseWeekQuery({ semana: '2026-10-19', dia: '2026-10-26' }, NOW).day).toBeNull();
    expect(parseWeekQuery({ semana: '2026-10-19', dia: 'x' }, NOW).day).toBeNull();
  });

  it('weekHref construye una URL con la semana y, si hay, el día', () => {
    expect(weekHref('/admin/agenda', '2026-10-19')).toBe('/admin/agenda?semana=2026-10-19');
    expect(weekHref('/admin/agenda', '2026-10-19', '2026-10-21')).toBe(
      '/admin/agenda?semana=2026-10-19&dia=2026-10-21',
    );
  });
});
