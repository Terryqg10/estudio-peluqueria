import { describe, expect, it } from 'vitest';
import {
  FIRST_DAY_OFFSET,
  LAST_DAY_OFFSET,
  madridToUtcIso,
  planSampleAppointments,
  type SampleStylist,
} from '../../scripts/lib/demo-seed.mjs';

// T-029: el plan de las citas de ejemplo es puro, determinista y respeta el horario del salón.
const svc = (id: string, name: string, durationMin: number) => ({ id, name, durationMin });
const STYLISTS: SampleStylist[] = [
  { id: 's1', name: 'Lucía', services: [svc('c', 'Corte', 45), svc('col', 'Color', 90), svc('b', 'Balayage', 180)] },
  { id: 's2', name: 'Carmen', services: [svc('c', 'Corte', 45), svc('p', 'Peinado', 30), svc('pe', 'Peinado de evento', 60)] },
  { id: 's3', name: 'Irene', services: [svc('k', 'Keratina', 150), svc('h', 'Hidratante', 30)] },
];
const TODAY = '2026-10-26'; // lunes

const plan = planSampleAppointments({ today: TODAY, stylists: STYLISTS });
const startMs = (a: (typeof plan)[number]) => new Date(madridToUtcIso(a.date, a.time)).getTime();
const endMs = (a: (typeof plan)[number]) => startMs(a) + a.minutes * 60000;

describe('planSampleAppointments (T-029)', () => {
  it('es determinista', () => {
    expect(planSampleAppointments({ today: TODAY, stylists: STYLISTS })).toEqual(plan);
  });

  it('genera citas en el rango de días previsto y ninguna en domingo', () => {
    expect(plan.length).toBeGreaterThan(20);
    const days = new Set(plan.map((a) => a.date));
    expect(days.has('2026-10-23')).toBe(true); // 3 días atrás
    expect(days.has('2026-11-05')).toBe(true); // 10 días adelante
    expect(FIRST_DAY_OFFSET).toBe(-3);
    expect(LAST_DAY_OFFSET).toBe(10);
    for (const a of plan) {
      const [y, m, d] = a.date.split('-').map(Number);
      expect(new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d)).getUTCDay(), a.date).not.toBe(0);
    }
  });

  it('solo usa servicios de la propia estilista', () => {
    for (const a of plan) {
      const stylist = STYLISTS.find((s) => s.id === a.stylistId);
      const service = stylist?.services.find((s) => s.id === a.serviceId);
      expect(service, `${a.stylistId} ${a.serviceId}`).toBeTruthy();
      expect(a.minutes).toBe(service?.durationMin);
    }
  });

  it('respeta el horario: lunes a viernes 10–20 h, sábado 10–14 h', () => {
    for (const a of plan) {
      const start = Number(a.time.slice(0, 2));
      const end = start + a.minutes / 60;
      const [y, m, d] = a.date.split('-').map(Number);
      const saturday = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d)).getUTCDay() === 6;
      expect(start, `${a.date} ${a.time}`).toBeGreaterThanOrEqual(10);
      expect(end, `${a.date} ${a.time} +${a.minutes}`).toBeLessThanOrEqual(saturday ? 14 : 20);
    }
  });

  it('no solapa dos citas de la misma estilista', () => {
    for (const stylist of STYLISTS) {
      const own = plan.filter((a) => a.stylistId === stylist.id).sort((a, b) => startMs(a) - startMs(b));
      for (let i = 1; i < own.length; i++) {
        const previous = own[i - 1];
        const current = own[i];
        if (!previous || !current) continue;
        expect(endMs(previous), `${stylist.id} ${previous.date} ${previous.time}`).toBeLessThanOrEqual(startMs(current));
      }
    }
  });

  it('estados coherentes: las pasadas están hechas o no se presentaron; las de hoy en adelante, confirmadas o canceladas', () => {
    for (const a of plan) {
      if (a.date < TODAY) expect(['completed', 'no_show'], a.date).toContain(a.status);
      else expect(['confirmed', 'cancelled'], a.date).toContain(a.status);
    }
    expect(plan.some((a) => a.status === 'cancelled')).toBe(true);
    expect(plan.some((a) => a.status === 'confirmed')).toBe(true);
  });

  it('todo es claramente ficticio y único', () => {
    for (const a of plan) {
      expect(a.email).toMatch(/^[a-z.]+\.\d+@ejemplo\.invalid$/);
      expect(a.phone).toMatch(/^\+34 600 000 0\d\d$/);
      expect(a.name.length).toBeGreaterThan(5);
    }
    expect(new Set(plan.map((a) => a.email)).size).toBe(plan.length);
    expect(plan.some((a) => a.note)).toBe(true);
    for (const a of plan) if (a.note) expect(a.note).toContain('(ejemplo)');
  });

  it('sin estilistas o sin servicios no genera nada', () => {
    expect(planSampleAppointments({ today: TODAY, stylists: [] })).toEqual([]);
    expect(planSampleAppointments({ today: TODAY, stylists: [{ id: 'x', name: 'X', services: [] }] })).toEqual([]);
  });
});

describe('madridToUtcIso', () => {
  it('invierno (UTC+1) y verano (UTC+2)', () => {
    expect(madridToUtcIso('2026-01-15', '10:00')).toBe('2026-01-15T09:00:00.000Z');
    expect(madridToUtcIso('2026-07-15', '10:00')).toBe('2026-07-15T08:00:00.000Z');
  });

  it('los cambios de hora de octubre y marzo', () => {
    expect(madridToUtcIso('2026-10-25', '10:00')).toBe('2026-10-25T09:00:00.000Z'); // ya en invierno
    expect(madridToUtcIso('2026-10-24', '10:00')).toBe('2026-10-24T08:00:00.000Z'); // aún en verano
    expect(madridToUtcIso('2026-03-29', '16:00')).toBe('2026-03-29T14:00:00.000Z'); // ya en verano
  });
});
