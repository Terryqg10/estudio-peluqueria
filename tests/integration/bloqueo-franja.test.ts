import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  anonClient,
  cleanup,
  createAdmin,
  createService,
  createStylist,
  createUser,
  ensureSalonHours,
  insertAppointment,
  offerService,
  service,
  setSchedule,
  type TestUser,
} from './helpers/db';
import { madridInstant, sundayDateAhead } from './helpers/time';

// CA-19 (RF-07, ADR-0028): el Admin bloquea una franja y esos huecos desaparecen de la disponibilidad pública.
// Domingo 10:00–18:00 y servicio de 60 min: sin bloqueo hay inicios cada 15 min hasta las 17:00.
const SUNDAY = 7;

describe('bloqueo-franja (CA-19): admin_create_time_blocks', () => {
  const date = sundayDateAhead(24);
  const at = (hour: number, minute = 0) => madridInstant(date, hour, minute);
  const iso = (value: string) => new Date(value).toISOString();

  let svc = '';
  let admin: TestUser;
  let clienta: TestUser;
  let stylistA = '';
  let stylistB = '';

  beforeAll(async () => {
    await ensureSalonHours(SUNDAY, '10:00', '20:00');
    svc = await createService(60);
    admin = await createAdmin();
    clienta = await createUser('clienta');
  });

  beforeEach(async () => {
    stylistA = await createStylist('Estilista A');
    stylistB = await createStylist('Estilista B');
    for (const id of [stylistA, stylistB]) {
      await setSchedule(id, SUNDAY, '10:00', '18:00');
      await offerService(id, svc);
    }
  });

  // La reserva de la prueba de carrera no la rastrean los helpers: se borra aquí para que `cleanup` pueda
  // borrar las estilistas (las citas las referencian con `on delete restrict`).
  afterEach(async () => {
    await service.from('appointments').delete().in('stylist_id', [stylistA, stylistB]);
  });

  afterAll(cleanup);

  const block = (stylists: string[], start: string, end: string, note?: string) =>
    admin.client.rpc('admin_create_time_blocks', {
      p_stylist_ids: stylists,
      p_kind: 'block',
      p_starts_at: start,
      p_ends_at: end,
      p_note: note,
    });

  async function starts(stylistId: string): Promise<string[]> {
    const { data, error } = await anonClient().rpc('get_availability', {
      p_service_id: svc,
      p_date: date,
      p_stylist_id: stylistId,
    });
    expect(error).toBeNull();
    return (data ?? []).map((s) => new Date(s.starts_at).toISOString());
  }

  it('los huecos que tocan la franja 14:00–16:00 desaparecen; los demás siguen y otra estilista no cambia', async () => {
    const before = await starts(stylistA);
    expect(before).toContain(iso(at(14)));

    const { data, error } = await block([stylistA], at(14), at(16), 'Médico');
    expect(error).toBeNull();
    expect(data).toBe(1);

    const after = await starts(stylistA);
    // Con 60 min, un inicio solapa la franja entre 13:15 y 15:45 (ambos incluidos).
    for (const forbidden of [at(13, 15), at(14), at(15), at(15, 45)]) expect(after).not.toContain(iso(forbidden));
    for (const free of [at(10), at(13), at(16), at(17)]) expect(after).toContain(iso(free));
    expect(await starts(stylistB)).toEqual(before);

    const row = await service.from('time_blocks').select('kind, note').eq('stylist_id', stylistA).single();
    expect(row.data).toEqual({ kind: 'block', note: 'Médico' });
  });

  it('quitar el bloqueo devuelve los huecos', async () => {
    const before = await starts(stylistA);
    expect((await block([stylistA], at(14), at(16))).error).toBeNull();
    expect(await starts(stylistA)).not.toEqual(before);

    const removed = await admin.client.from('time_blocks').delete().eq('stylist_id', stylistA).select('id');
    expect(removed.data).toHaveLength(1);
    expect(await starts(stylistA)).toEqual(before);
  });

  it('una clienta y un anónimo no pueden crear bloqueos ni quitarlos', async () => {
    const args = {
      p_stylist_ids: [stylistA],
      p_kind: 'block' as const,
      p_starts_at: at(14),
      p_ends_at: at(16),
    };
    expect((await clienta.client.rpc('admin_create_time_blocks', args)).error?.message).toBe('FORBIDDEN');
    expect((await anonClient().rpc('admin_create_time_blocks', args)).error).not.toBeNull();
    expect((await service.from('time_blocks').select('id').eq('stylist_id', stylistA)).data).toEqual([]);

    await block([stylistA], at(14), at(16));
    const del = await clienta.client.from('time_blocks').delete().eq('stylist_id', stylistA).select('id');
    expect(del.data ?? []).toEqual([]);
    expect((await service.from('time_blocks').select('id').eq('stylist_id', stylistA)).data).toHaveLength(1);
  });

  it('si hay una cita activa en la franja da CONFLICT y no crea nada; una cancelada no cuenta', async () => {
    const appt = await insertAppointment({ stylistId: stylistA, serviceId: svc, start: new Date(at(14, 30)) });
    expect(appt.error).toBeNull();

    const conflict = await block([stylistA], at(14), at(16));
    expect(conflict.error?.message).toBe('CONFLICT');
    expect((await service.from('time_blocks').select('id').eq('stylist_id', stylistA)).data).toEqual([]);

    await service.from('appointments').update({ status: 'cancelled' }).eq('id', appt.data?.id ?? '');
    expect((await block([stylistA], at(14), at(16))).error).toBeNull();
  });

  it('una cita que solo roza el borde (termina justo cuando empieza el bloqueo) no es conflicto', async () => {
    await insertAppointment({ stylistId: stylistA, serviceId: svc, start: new Date(at(13)), minutes: 60 }); // 13:00–14:00
    expect((await block([stylistA], at(14), at(16))).error).toBeNull();
  });

  it('«todas»: con una sola cita en conflicto no se crea ningún bloqueo', async () => {
    await insertAppointment({ stylistId: stylistB, serviceId: svc, start: new Date(at(15)) });
    const result = await block([stylistA, stylistB], at(14), at(16));
    expect(result.error?.message).toBe('CONFLICT');
    const created = await service.from('time_blocks').select('id').in('stylist_id', [stylistA, stylistB]);
    expect(created.data).toEqual([]);
  });

  it('«todas» sin conflicto crea un bloqueo por estilista (una repetida cuenta una vez)', async () => {
    const { data, error } = await block([stylistA, stylistB, stylistA], at(14), at(16));
    expect(error).toBeNull();
    expect(data).toBe(2);
    expect((await service.from('time_blocks').select('id').in('stylist_id', [stylistA, stylistB])).data).toHaveLength(2);
  });

  it('rechaza datos no válidos sin crear nada', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const longEnd = new Date(new Date(at(10)).getTime() + 400 * 86_400_000).toISOString();
    const cases: [string, string[], string, string, string | undefined][] = [
      ['sin estilistas', [], at(14), at(16), undefined],
      ['estilista inexistente', ['00000000-0000-0000-0000-000000000000'], at(14), at(16), undefined],
      ['inicio = fin', [stylistA], at(14), at(14), undefined],
      ['fin antes del inicio', [stylistA], at(16), at(14), undefined],
      ['todo en el pasado', [stylistA], past, new Date(Date.now() - 3_600_000).toISOString(), undefined],
      ['más de 366 días', [stylistA], at(10), longEnd, undefined],
      ['nota demasiado larga', [stylistA], at(14), at(16), 'x'.repeat(201)],
    ];
    for (const [label, ids, start, end, note] of cases) {
      const { error } = await block(ids, start, end, note);
      expect(error?.message, label).toBe('INVALID_INPUT');
    }
    expect((await service.from('time_blocks').select('id').eq('stylist_id', stylistA)).data).toEqual([]);
  });

  it('el tipo «break» no se admite desde el panel', async () => {
    const { error } = await admin.client.rpc('admin_create_time_blocks', {
      p_stylist_ids: [stylistA],
      p_kind: 'break',
      p_starts_at: at(14),
      p_ends_at: at(16),
    });
    expect(error?.message).toBe('INVALID_INPUT');
  });

  it('una reserva simultánea no se cuela dentro del bloqueo: nunca quedan bloqueo y cita a la vez', async () => {
    const attempts = await Promise.all([
      block([stylistA], at(14), at(16)),
      service.rpc('create_booking', {
        p_service_id: svc,
        p_stylist_id: stylistA,
        p_starts_at: at(14, 30),
        p_guest_name: 'Persona de prueba',
        p_guest_email: `carrera-${Date.now()}@test.invalid`,
        p_guest_phone: '+34600000000',
        p_consent_version: 'v1',
      }),
    ]);
    const blocked = (await service.from('time_blocks').select('id').eq('stylist_id', stylistA)).data ?? [];
    const booked =
      (
        await service
          .from('appointments')
          .select('id')
          .eq('stylist_id', stylistA)
          .neq('status', 'cancelled')
          .overlaps('during', `[${at(14)},${at(16)})`)
      ).data ?? [];
    const detail = JSON.stringify(attempts.map((a) => a.error?.message));
    expect(blocked.length === 0 || booked.length === 0, detail).toBe(true);
    // Y exactamente una de las dos operaciones tuvo éxito.
    expect(blocked.length + booked.length, detail).toBeGreaterThan(0);
  });
});
