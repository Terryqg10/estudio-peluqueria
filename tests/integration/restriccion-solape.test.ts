import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanup,
  createService,
  createStylist,
  daysFromNow,
  insertAppointment,
  service,
} from './helpers/db';

// CA-09 (RF-03): una estilista no puede tener dos citas activas solapadas, y las
// canceladas no bloquean. La garantía es de la BD (exclusion_violation = 23P01).
const EXCLUSION_VIOLATION = '23P01';

describe('restriccion-solape (CA-09)', () => {
  let stylistA: string;
  let stylistB: string;
  let serviceId: string;

  beforeAll(async () => {
    stylistA = await createStylist('Estilista A');
    stylistB = await createStylist('Estilista B');
    serviceId = await createService(60);
  });

  afterAll(cleanup);

  it('rechaza una cita idéntica a una activa de la misma estilista', async () => {
    const start = daysFromNow(10, 10);
    const first = await insertAppointment({ stylistId: stylistA, serviceId, start });
    expect(first.error).toBeNull();

    const second = await insertAppointment({ stylistId: stylistA, serviceId, start });
    expect(second.error?.code).toBe(EXCLUSION_VIOLATION);
  });

  it('rechaza un solape parcial', async () => {
    const start = daysFromNow(11, 10);
    await insertAppointment({ stylistId: stylistA, serviceId, start, minutes: 60 });

    const overlapping = new Date(start.getTime() + 30 * 60_000);
    const result = await insertAppointment({ stylistId: stylistA, serviceId, start: overlapping });
    expect(result.error?.code).toBe(EXCLUSION_VIOLATION);
  });

  it('permite citas contiguas (el fin es exclusivo)', async () => {
    const start = daysFromNow(12, 10);
    await insertAppointment({ stylistId: stylistA, serviceId, start, minutes: 60 });

    const next = new Date(start.getTime() + 60 * 60_000);
    const result = await insertAppointment({ stylistId: stylistA, serviceId, start: next });
    expect(result.error).toBeNull();
  });

  it('permite el mismo hueco a otra estilista', async () => {
    const start = daysFromNow(13, 10);
    await insertAppointment({ stylistId: stylistA, serviceId, start });

    const result = await insertAppointment({ stylistId: stylistB, serviceId, start });
    expect(result.error).toBeNull();
  });

  it('una cita cancelada no bloquea el hueco', async () => {
    const start = daysFromNow(14, 10);
    const cancelled = await insertAppointment({
      stylistId: stylistA,
      serviceId,
      start,
      status: 'cancelled',
    });
    expect(cancelled.error).toBeNull();

    const result = await insertAppointment({ stylistId: stylistA, serviceId, start });
    expect(result.error).toBeNull();
  });

  it('no se puede reactivar una cancelada si su hueco ya está ocupado', async () => {
    const start = daysFromNow(15, 10);
    const cancelled = await insertAppointment({
      stylistId: stylistA,
      serviceId,
      start,
      status: 'cancelled',
    });
    await insertAppointment({ stylistId: stylistA, serviceId, start });

    const reactivate = await service
      .from('appointments')
      .update({ status: 'confirmed' })
      .eq('id', cancelled.data?.id ?? '');
    expect(reactivate.error?.code).toBe(EXCLUSION_VIOLATION);
  });

  it('con dos reservas simultáneas del mismo hueco, solo una entra', async () => {
    const start = daysFromNow(16, 10);
    const results = await Promise.all([
      insertAppointment({ stylistId: stylistA, serviceId, start }),
      insertAppointment({ stylistId: stylistA, serviceId, start }),
    ]);
    const ok = results.filter((r) => r.error === null);
    const rejected = results.filter((r) => r.error?.code === EXCLUSION_VIOLATION);
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it('rechaza una cita sin titular (ni cuenta ni datos de invitada)', async () => {
    const result = await service.from('appointments').insert({
      stylist_id: stylistA,
      service_id: serviceId,
      during: '[2030-01-01T10:00:00Z,2030-01-01T11:00:00Z)',
    });
    expect(result.error?.code).toBe('23514');
  });
});
