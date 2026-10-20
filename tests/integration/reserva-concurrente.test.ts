import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays } from '@/lib/booking/dates';
import {
  anonClient,
  cleanup,
  createService,
  createStylist,
  ensureSalonHours,
  insertAppointment,
  offerService,
  service,
  setSchedule,
} from './helpers/db';
import { madridInstant, sundayDateAhead } from './helpers/time';

// CA-08 (RF-03) y ADR-0024: reservas y reprogramaciones simultáneas al mismo hueco. Exactamente una gana
// y las demás reciben `SLOT_TAKEN`; NINGUNA debe recibir un deadlock (`40P01`). Cada «ronda» lanza las
// peticiones a la vez y comprueba el reparto de resultados y que no se tarde segundos (un deadlock
// tarda ≥ 1 s en detectarse; medido 3–5 s). Domingo con horario 10:00–14:00, servicio de 15 min.
const SUNDAY = 7;
const ROUNDS = Number(process.env.RACE_ROUNDS ?? 50);
// Una ronda sin competencia tarda ~10 ms; un deadlock, segundos. Margen amplio contra máquinas lentas.
const MAX_ROUND_MS = 2000;

type Outcome = { ok: boolean; code: string | null; message: string | null };

type Booked = { id: string; token: string };

const outcome = (r: { error: { code?: string; message: string } | null }): Outcome => ({
  ok: r.error === null,
  code: r.error?.code ?? null,
  message: r.error?.message ?? null,
});

describe('reserva-concurrente (CA-08, ADR-0024)', () => {
  const firstSunday = sundayDateAhead(21);
  // 16 inicios por domingo (10:00–13:45, servicio de 15 min); 4 domingos dan 64 huecos distintos.
  const slots: string[] = [];
  for (let week = 0; week < 4; week++) {
    const date = addDays(firstSunday, 7 * week);
    for (let i = 0; i < 16; i++) slots.push(madridInstant(date, 10 + Math.floor(i / 4), (i % 4) * 15));
  }

  let svc = '';
  let stylistA = '';
  let stylistB = '';
  const roundTimes: number[] = [];

  beforeAll(async () => {
    await ensureSalonHours(SUNDAY, '10:00', '20:00');
    svc = await createService(15);
    stylistA = await createStylist('Concurrente A');
    stylistB = await createStylist('Concurrente B');
    for (const id of [stylistA, stylistB]) {
      await setSchedule(id, SUNDAY, '10:00', '14:00');
      await offerService(id, svc);
    }
  });

  // Cada test parte de una estilista sin citas: lo que deje un test no puede ocupar los huecos del siguiente.
  beforeEach(async () => {
    await service.from('appointments').delete().in('stylist_id', [stylistA, stylistB]);
  });

  afterAll(async () => {
    await service.from('appointments').delete().like('guest_email', 'conc-%@test.invalid');
    await cleanup();
    if (roundTimes.length > 0) {
      const sorted = [...roundTimes].sort((a, b) => a - b);
      console.warn(
        `[reserva-concurrente] ${roundTimes.length} rondas; ms mediana/p95/máx = ` +
          `${sorted[Math.floor(sorted.length / 2)]}/${sorted[Math.floor(sorted.length * 0.95)]}/${sorted[sorted.length - 1]}`,
      );
    }
  });

  const book = (stylistId: string, startsAt: string) =>
    service.rpc('create_booking', {
      p_service_id: svc,
      p_stylist_id: stylistId,
      p_starts_at: startsAt,
      p_guest_name: 'Ana García',
      p_guest_email: `conc-${randomUUID()}@test.invalid`,
      p_guest_phone: '+34 600 000 000',
      p_consent_version: 'borrador-1',
    });

  const move = (token: string, stylistId: string, startsAt: string) =>
    anonClient().rpc('reschedule_guest_appointment', {
      p_token: token,
      p_stylist_id: stylistId,
      p_starts_at: startsAt,
    });

  // Cita directa (service_role) con su token de gestión.
  async function appointmentWithToken(stylistId: string, start: string) {
    const created = await insertAppointment({ stylistId, serviceId: svc, start: new Date(start), minutes: 15 });
    const id = created.data?.id ?? '';
    expect(id).not.toBe('');
    const issued = await service.rpc('issue_management_token', { p_appointment_id: id });
    return { id, token: issued.data ?? '' };
  }

  const timed = async <T,>(fn: () => Promise<T>) => {
    const t = Date.now();
    const value = await fn();
    const ms = Date.now() - t;
    roundTimes.push(ms);
    return { value, ms };
  };

  const countOk = (list: Outcome[]) => list.filter((o) => o.ok).length;
  // Mensaje de lo que NO es ni éxito ni `SLOT_TAKEN`: debe estar siempre vacío (sobre todo `40P01`).
  const unexpected = (list: Outcome[]) =>
    list.filter((o) => !o.ok && o.message !== 'SLOT_TAKEN').map((o) => `${o.code ?? ''}:${o.message ?? ''}`);

  it(`${ROUNDS} rondas de 6 reservas simultáneas al mismo hueco: una gana, cinco reciben SLOT_TAKEN, ningún deadlock`, async () => {
    const problems: string[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      const slot = slots[round % slots.length] ?? '';
      const { value, ms } = await timed(async () =>
        (await Promise.all(Array.from({ length: 6 }, () => book(stylistA, slot)))).map(outcome),
      );
      if (countOk(value) !== 1) problems.push(`ronda ${round}: ${countOk(value)} reservas creadas`);
      const odd = unexpected(value);
      if (odd.length > 0) problems.push(`ronda ${round} (${ms} ms): ${[...new Set(odd)].join(', ')} x${odd.length}`);
      if (ms > MAX_ROUND_MS) problems.push(`ronda ${round}: tardó ${ms} ms`);
      // Se libera el hueco para reutilizarlo cuando se agoten los distintos.
      if (round % slots.length === slots.length - 1) {
        await service.from('appointments').delete().like('guest_email', 'conc-%@test.invalid');
      }
    }
    expect(problems).toEqual([]);
  }, 300_000);

  it(`${Math.min(ROUNDS, 20)} rondas de 6 reprogramaciones simultáneas al mismo hueco: una gana, cinco SLOT_TAKEN, ningún deadlock`, async () => {
    const rounds = Math.min(ROUNDS, 20);
    const problems: string[] = [];
    for (let round = 0; round < rounds; round++) {
      // 6 citas de 6 personas en huecos propios (10:00–11:15) y un hueco libre de destino (13:00).
      const date = addDays(firstSunday, 7 * (round % 4));
      const origins = Array.from({ length: 6 }, (_, i) => madridInstant(date, 10 + Math.floor(i / 4), (i % 4) * 15));
      const target = madridInstant(date, 13, 0);
      const created: Booked[] = [];
      for (const start of origins) created.push(await appointmentWithToken(stylistA, start));

      const { value, ms } = await timed(async () =>
        (await Promise.all(created.map((c) => move(c.token, stylistA, target)))).map(outcome),
      );
      if (countOk(value) !== 1) problems.push(`ronda ${round}: ${countOk(value)} reprogramaciones aplicadas`);
      const odd = unexpected(value);
      if (odd.length > 0) problems.push(`ronda ${round} (${ms} ms): ${[...new Set(odd)].join(', ')} x${odd.length}`);
      if (ms > MAX_ROUND_MS) problems.push(`ronda ${round}: tardó ${ms} ms`);

      await service.from('appointments').delete().in('id', created.map((c) => c.id));
    }
    expect(problems).toEqual([]);
  }, 300_000);

  it('10 rondas mixtas (3 reservas + 3 reprogramaciones al mismo hueco): una gana, el resto SLOT_TAKEN', async () => {
    const problems: string[] = [];
    for (let round = 0; round < 10; round++) {
      const date = addDays(firstSunday, 7 * (round % 4));
      const origins = Array.from({ length: 3 }, (_, i) => madridInstant(date, 10, i * 15));
      const target = madridInstant(date, 12, 30);
      const created: Booked[] = [];
      for (const start of origins) created.push(await appointmentWithToken(stylistA, start));

      const { value, ms } = await timed(async () =>
        (
          await Promise.all([
            ...Array.from({ length: 3 }, () => book(stylistA, target)),
            ...created.map((c) => move(c.token, stylistA, target)),
          ])
        ).map(outcome),
      );
      if (countOk(value) !== 1) problems.push(`ronda ${round}: ${countOk(value)} operaciones aplicadas`);
      const odd = unexpected(value);
      if (odd.length > 0) problems.push(`ronda ${round} (${ms} ms): ${[...new Set(odd)].join(', ')} x${odd.length}`);
      if (ms > MAX_ROUND_MS) problems.push(`ronda ${round}: tardó ${ms} ms`);

      await service.from('appointments').delete().in('id', created.map((c) => c.id));
      await service.from('appointments').delete().like('guest_email', 'conc-%@test.invalid');
    }
    expect(problems).toEqual([]);
  }, 300_000);

  it('20 rondas con dos citas que intercambian de estilista a la vez (cada una al hueco de la otra): sin deadlock', async () => {
    const problems: string[] = [];
    for (let round = 0; round < 20; round++) {
      // X está con A y Y con B a la misma hora; cada una pide pasar a la otra estilista a esa misma hora.
      const slot = madridInstant(addDays(firstSunday, 7 * (round % 4)), 10 + Math.floor((round % 16) / 4), ((round % 16) % 4) * 15);
      const x = await appointmentWithToken(stylistA, slot);
      const y = await appointmentWithToken(stylistB, slot);

      const { value, ms } = await timed(async () =>
        (await Promise.all([move(x.token, stylistB, slot), move(y.token, stylistA, slot)])).map(outcome),
      );
      const odd = unexpected(value);
      if (odd.length > 0) problems.push(`ronda ${round} (${ms} ms): ${[...new Set(odd)].join(', ')}`);
      if (ms > MAX_ROUND_MS) problems.push(`ronda ${round}: tardó ${ms} ms`);

      await service.from('appointments').delete().in('id', [x.id, y.id]);
    }
    expect(problems).toEqual([]);
  }, 300_000);

  it('10 rondas con una cancelación a la vez que 3 reservas del mismo hueco: sin deadlock y como mucho una reserva entra', async () => {
    const problems: string[] = [];
    for (let round = 0; round < 10; round++) {
      const slot = madridInstant(addDays(firstSunday, 7 * (round % 4)), 12, 0);
      const existing = await appointmentWithToken(stylistA, slot);

      const { value, ms } = await timed(async () => {
        const [cancel, ...bookings] = await Promise.all([
          anonClient().rpc('cancel_guest_appointment', { p_token: existing.token }),
          book(stylistA, slot),
          book(stylistA, slot),
          book(stylistA, slot),
        ]);
        return { cancel: outcome(cancel), bookings: bookings.map(outcome) };
      });
      if (!value.cancel.ok) problems.push(`ronda ${round}: la cancelación falló (${value.cancel.message})`);
      if (countOk(value.bookings) > 1) problems.push(`ronda ${round}: ${countOk(value.bookings)} reservas entraron`);
      const odd = unexpected(value.bookings);
      if (odd.length > 0) problems.push(`ronda ${round} (${ms} ms): ${[...new Set(odd)].join(', ')} x${odd.length}`);
      if (ms > MAX_ROUND_MS) problems.push(`ronda ${round}: tardó ${ms} ms`);

      await service.from('appointments').delete().eq('id', existing.id);
      await service.from('appointments').delete().like('guest_email', 'conc-%@test.invalid');
    }
    expect(problems).toEqual([]);
  }, 300_000);

  it('dos estilistas distintas reservando el mismo instante a la vez no se estorban: una gana en cada una', async () => {
    const problems: string[] = [];
    for (let round = 0; round < 10; round++) {
      const slot = slots[round] ?? '';
      const { value, ms } = await timed(async () => {
        const all = await Promise.all([
          ...Array.from({ length: 4 }, () => book(stylistA, slot)),
          ...Array.from({ length: 4 }, () => book(stylistB, slot)),
        ]);
        return { a: all.slice(0, 4).map(outcome), b: all.slice(4).map(outcome) };
      });
      if (countOk(value.a) !== 1 || countOk(value.b) !== 1) {
        problems.push(`ronda ${round}: A=${countOk(value.a)} B=${countOk(value.b)} (se esperaba 1 y 1)`);
      }
      const odd = unexpected([...value.a, ...value.b]);
      if (odd.length > 0) problems.push(`ronda ${round} (${ms} ms): ${[...new Set(odd)].join(', ')}`);
      if (ms > MAX_ROUND_MS) problems.push(`ronda ${round}: tardó ${ms} ms`);
    }
    await service.from('appointments').delete().like('guest_email', 'conc-%@test.invalid');
    expect(problems).toEqual([]);
  }, 300_000);

  it('el bloqueo se libera al fallar por validación: una petición inválida no frena a la siguiente', async () => {
    const slot = slots[0] ?? '';
    const invalid = await service.rpc('create_booking', {
      p_service_id: randomUUID(),
      p_stylist_id: stylistA,
      p_starts_at: slot,
      p_guest_name: 'Ana García',
      p_guest_email: `conc-${randomUUID()}@test.invalid`,
      p_guest_phone: '+34 600 000 000',
      p_consent_version: 'borrador-1',
    });
    expect(invalid.error?.message).toBe('INVALID_SELECTION');

    const t = Date.now();
    const ok = await book(stylistA, slot);
    expect(ok.error).toBeNull();
    expect(Date.now() - t).toBeLessThan(MAX_ROUND_MS);
    await service.from('appointments').delete().like('guest_email', 'conc-%@test.invalid');
  });
});
