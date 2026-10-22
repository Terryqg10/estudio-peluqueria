import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  anonClient,
  cleanup,
  createAdmin,
  createService,
  createStylist,
  ensureSalonHours,
  insertAppointment,
  offerService,
  service,
  setSchedule,
  type TestUser,
} from './helpers/db';
import { madridInstant, sundayDateAhead } from './helpers/time';

// CA-20 (RF-07, ADR-0028): vacaciones de un día o un rango; no se ofrecen huecos y, si hay citas, hay que
// resolverlas antes. Sábado y domingo con horario 10:00–18:00; las vacaciones son días completos de Madrid.
const SATURDAY = 6;
const SUNDAY = 7;

function addDay(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('vacaciones (CA-20): admin_create_time_blocks', () => {
  const sunday = sundayDateAhead(30);
  const saturday = addDay(sunday, -1);
  const monday = addDay(sunday, 1);
  const at = (date: string, hour: number, minute = 0) => madridInstant(date, hour, minute);
  // Días completos [desde, hasta] inclusive, en hora de Madrid.
  const startOf = (date: string) => at(date, 0);
  const endOf = (date: string) => madridInstant(addDay(date, 1), 0);

  let svc = '';
  let admin: TestUser;
  let stylistA = '';
  let stylistB = '';

  beforeAll(async () => {
    for (const weekday of [SATURDAY, SUNDAY]) await ensureSalonHours(weekday, '10:00', '20:00');
    svc = await createService(60);
    admin = await createAdmin();
  });

  beforeEach(async () => {
    stylistA = await createStylist('Estilista A');
    stylistB = await createStylist('Estilista B');
    for (const id of [stylistA, stylistB]) {
      for (const weekday of [SATURDAY, SUNDAY]) await setSchedule(id, weekday, '10:00', '18:00');
      await offerService(id, svc);
    }
  });

  afterAll(cleanup);

  const vacation = (stylists: string[], from: string, to: string, note?: string) =>
    admin.client.rpc('admin_create_time_blocks', {
      p_stylist_ids: stylists,
      p_kind: 'vacation',
      p_starts_at: startOf(from),
      p_ends_at: endOf(to),
      p_note: note,
    });

  async function count(stylistId: string, date: string): Promise<number> {
    const { data, error } = await anonClient().rpc('get_availability', {
      p_service_id: svc,
      p_date: date,
      p_stylist_id: stylistId,
    });
    expect(error).toBeNull();
    return (data ?? []).length;
  }

  it('un día de vacaciones: no hay huecos ese día y sí el anterior', async () => {
    expect(await count(stylistA, sunday)).toBeGreaterThan(0);
    expect((await vacation([stylistA], sunday, sunday)).error).toBeNull();

    expect(await count(stylistA, sunday)).toBe(0);
    expect(await count(stylistA, saturday)).toBeGreaterThan(0);
    expect(await count(stylistB, sunday)).toBeGreaterThan(0);
  });

  it('un rango de días, inclusive en los dos extremos', async () => {
    expect((await vacation([stylistA], saturday, sunday, 'Vacaciones de verano')).error).toBeNull();
    expect(await count(stylistA, saturday)).toBe(0);
    expect(await count(stylistA, sunday)).toBe(0);

    const row = await service.from('time_blocks').select('kind, note').eq('stylist_id', stylistA).single();
    expect(row.data).toEqual({ kind: 'vacation', note: 'Vacaciones de verano' });
  });

  it('con citas activas en el rango da CONFLICT y no crea nada; resueltas, se aplican', async () => {
    const appt = await insertAppointment({ stylistId: stylistA, serviceId: svc, start: new Date(at(sunday, 12)) });
    expect(appt.error).toBeNull();

    const refused = await vacation([stylistA], saturday, sunday);
    expect(refused.error?.message).toBe('CONFLICT');
    expect((await service.from('time_blocks').select('id').eq('stylist_id', stylistA)).data).toEqual([]);
    expect(await count(stylistA, saturday)).toBeGreaterThan(0);

    // El Admin cancela la cita con su función (T-008c) y repite.
    const cancelled = await admin.client.rpc('admin_cancel_appointment', { p_appointment_id: appt.data?.id ?? '' });
    expect(cancelled.error).toBeNull();
    expect((await vacation([stylistA], saturday, sunday)).error).toBeNull();
    expect(await count(stylistA, sunday)).toBe(0);
  });

  it('una cita al día siguiente del último día de vacaciones no es conflicto', async () => {
    await insertAppointment({ stylistId: stylistA, serviceId: svc, start: new Date(at(monday, 10)) });
    expect((await vacation([stylistA], saturday, sunday)).error).toBeNull();
  });

  it('«todas» las estilistas: con una cita de una sola en el rango no se crea ninguna', async () => {
    await insertAppointment({ stylistId: stylistB, serviceId: svc, start: new Date(at(saturday, 11)) });
    expect((await vacation([stylistA, stylistB], saturday, sunday)).error?.message).toBe('CONFLICT');
    expect((await service.from('time_blocks').select('id').in('stylist_id', [stylistA, stylistB])).data).toEqual([]);

    await service.from('appointments').delete().eq('stylist_id', stylistB);
    expect((await vacation([stylistA, stylistB], saturday, sunday)).error).toBeNull();
    expect(await count(stylistA, sunday)).toBe(0);
    expect(await count(stylistB, saturday)).toBe(0);
  });

  it('quitar las vacaciones devuelve los huecos', async () => {
    const before = await count(stylistA, sunday);
    expect((await vacation([stylistA], sunday, sunday)).error).toBeNull();
    expect(await count(stylistA, sunday)).toBe(0);

    const removed = await admin.client.from('time_blocks').delete().eq('stylist_id', stylistA).select('id');
    expect(removed.data).toHaveLength(1);
    expect(await count(stylistA, sunday)).toBe(before);
  });
});
