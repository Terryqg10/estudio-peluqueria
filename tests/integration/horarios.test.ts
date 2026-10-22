import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  anonClient,
  cleanup,
  createAdmin,
  createService,
  createStylist,
  createUser,
  insertAppointment,
  offerService,
  service,
  type TestUser,
} from './helpers/db';
import { madridInstant, sundayDateAhead } from './helpers/time';
import type { Json } from '@/lib/database.types';

// CA-38 y CA-39 (RF-07, ADR-0029): el Admin cambia el horario semanal (de una estilista o del salón) y la
// disponibilidad pública lo usa; si deja citas futuras fuera, se rechaza sin cambiar nada y se listan.
// Los tests de salón guardan y restauran las filas originales de `salon_hours`.
type Range = { weekday: number; starts: string; ends: string };

describe('horarios (CA-38, CA-39): admin_save_weekly_hours', () => {
  const date = sundayDateAhead(40);
  const at = (hour: number, minute = 0) => madridInstant(date, hour, minute);
  const iso = (value: string) => new Date(value).toISOString();

  let svc = '';
  let admin: TestUser;
  let clienta: TestUser;
  let stylist = '';
  let other = '';
  let originalSalon: Range[] = [];

  async function salonRows(): Promise<Range[]> {
    const { data } = await service.from('salon_hours').select('weekday, opens, closes').order('weekday').order('opens');
    return (data ?? []).map((r) => ({ weekday: r.weekday, starts: r.opens.slice(0, 5), ends: r.closes.slice(0, 5) }));
  }

  async function stylistRows(id: string): Promise<Range[]> {
    const { data } = await service
      .from('stylist_schedule')
      .select('weekday, starts, ends')
      .eq('stylist_id', id)
      .order('weekday')
      .order('starts');
    return (data ?? []).map((r) => ({ weekday: r.weekday, starts: r.starts.slice(0, 5), ends: r.ends.slice(0, 5) }));
  }

  const save = (id: string | null, ranges: unknown) =>
    admin.client.rpc('admin_save_weekly_hours', { p_stylist_id: id ?? undefined, p_ranges: ranges as Json });

  const conflicts = (id: string | null, ranges: unknown) =>
    admin.client.rpc('admin_schedule_conflicts', { p_stylist_id: id ?? undefined, p_ranges: ranges as Json });

  async function starts(id: string): Promise<string[]> {
    const { data, error } = await anonClient().rpc('get_availability', {
      p_service_id: svc,
      p_date: date,
      p_stylist_id: id,
    });
    expect(error).toBeNull();
    return (data ?? []).map((s) => new Date(s.starts_at).toISOString());
  }

  async function restoreSalon() {
    await service.from('salon_hours').delete().not('id', 'is', null);
    await service
      .from('salon_hours')
      .insert(originalSalon.map((r) => ({ weekday: r.weekday, opens: r.starts, closes: r.ends })));
  }

  beforeAll(async () => {
    originalSalon = await salonRows();
    svc = await createService(60);
    admin = await createAdmin();
    clienta = await createUser('clienta');
  });

  beforeEach(async () => {
    stylist = await createStylist('Estilista A');
    other = await createStylist('Estilista B');
    await offerService(stylist, svc);
    await offerService(other, svc);
    // El salón abre también el domingo (además de su horario original) para poder probar ese día.
    const withSunday = [...originalSalon, { weekday: 7, starts: '10:00', ends: '20:00' }];
    const { error } = await save(null, withSunday);
    expect(error).toBeNull();
  });

  afterEach(async () => {
    await service.from('appointments').delete().in('stylist_id', [stylist, other]);
    await restoreSalon();
  });

  afterAll(async () => {
    await restoreSalon();
    await cleanup();
  });

  it('una clienta y un anónimo no pueden guardar ni consultar horarios', async () => {
    const ranges = [{ weekday: 7, starts: '10:00', ends: '14:00' }];
    for (const client of [clienta.client, anonClient()]) {
      const saved = await client.rpc('admin_save_weekly_hours', { p_stylist_id: stylist, p_ranges: ranges });
      const listed = await client.rpc('admin_schedule_conflicts', { p_stylist_id: stylist, p_ranges: ranges });
      expect(saved.error).not.toBeNull();
      expect(listed.error).not.toBeNull();
    }
    expect((await clienta.client.rpc('admin_save_weekly_hours', { p_stylist_id: stylist, p_ranges: ranges })).error?.message).toBe(
      'FORBIDDEN',
    );
    expect(await stylistRows(stylist)).toEqual([]);
  });

  it('CA-38: el horario de la estilista decide los huecos; varios tramos dejan una pausa', async () => {
    expect(await starts(stylist)).toEqual([]); // sin horario no hay huecos

    // 10:00–13:00 y 16:00–19:00: con 60 min, inicios hasta las 12:00 y hasta las 18:00.
    expect((await save(stylist, [
      { weekday: 7, starts: '10:00', ends: '13:00' },
      { weekday: 7, starts: '16:00', ends: '19:00' },
    ])).data).toBe(2);
    const split = await starts(stylist);
    for (const free of [at(10), at(12), at(16), at(18)]) expect(split).toContain(iso(free));
    for (const gone of [at(12, 15), at(13), at(14), at(15, 45), at(18, 15), at(19)]) expect(split).not.toContain(iso(gone));

    // Un solo tramo: reaparece la pausa.
    expect((await save(stylist, [{ weekday: 7, starts: '10:00', ends: '19:00' }])).error).toBeNull();
    expect(await starts(stylist)).toContain(iso(at(14)));

    // Otra estilista no cambia.
    expect(await starts(other)).toEqual([]);
  });

  it('CA-38: el horario del salón recorta el de la estilista (intersección) y un día libre quita los huecos', async () => {
    expect((await save(stylist, [{ weekday: 7, starts: '10:00', ends: '19:00' }])).error).toBeNull();
    expect(await starts(stylist)).toContain(iso(at(17)));

    // El salón cierra el domingo a las 14:00.
    const { error } = await save(null, [...originalSalon, { weekday: 7, starts: '10:00', ends: '14:00' }]);
    expect(error).toBeNull();
    const short = await starts(stylist);
    expect(short).toContain(iso(at(13)));
    expect(short).not.toContain(iso(at(13, 15)));
    expect(short).not.toContain(iso(at(17)));

    // Sin tramos de estilista ese domingo: día libre.
    expect((await save(stylist, [{ weekday: 1, starts: '10:00', ends: '18:00' }])).error).toBeNull();
    expect(await starts(stylist)).toEqual([]);
  });

  it('rechaza solapes, horas no válidas y estilistas inexistentes sin cambiar nada', async () => {
    const before = [{ weekday: 7, starts: '10:00', ends: '14:00' }];
    expect((await save(stylist, before)).error).toBeNull();

    const cases: [string, unknown, string?][] = [
      ['solape', [{ weekday: 7, starts: '10:00', ends: '14:00' }, { weekday: 7, starts: '12:00', ends: '16:00' }]],
      ['mismo inicio', [{ weekday: 7, starts: '10:00', ends: '12:00' }, { weekday: 7, starts: '10:00', ends: '14:00' }]],
      ['inicio = fin', [{ weekday: 7, starts: '10:00', ends: '10:00' }]],
      ['fin antes del inicio', [{ weekday: 7, starts: '14:00', ends: '10:00' }]],
      ['fuera de la rejilla', [{ weekday: 7, starts: '10:05', ends: '14:00' }]],
      ['hora imposible', [{ weekday: 7, starts: '10:00', ends: '25:00' }]],
      ['día 0', [{ weekday: 0, starts: '10:00', ends: '14:00' }]],
      ['día 8', [{ weekday: 8, starts: '10:00', ends: '14:00' }]],
      ['no es un array', { weekday: 7 }],
      ['elemento no objeto', ['10:00']],
      ['más de 70 tramos', Array.from({ length: 71 }, () => ({ weekday: 1, starts: '10:00', ends: '11:00' }))],
    ];
    for (const [label, ranges] of cases) {
      expect((await save(stylist, ranges)).error?.message, label).toBe('INVALID_INPUT');
    }
    expect((await save('00000000-0000-0000-0000-000000000000', before)).error?.message).toBe('INVALID_INPUT');
    expect(await stylistRows(stylist)).toEqual(before);
  });

  it('tramos de días distintos que se tocan o repiten hora no son solape', async () => {
    const ok = [
      { weekday: 6, starts: '10:00', ends: '14:00' },
      { weekday: 7, starts: '10:00', ends: '14:00' },
      { weekday: 7, starts: '14:00', ends: '18:00' },
    ];
    expect((await save(stylist, ok)).data).toBe(3);
    expect(await stylistRows(stylist)).toEqual(ok);
  });

  it('CA-39: con una cita que quedaría fuera da CONFLICT, no cambia nada y se lista', async () => {
    const original = [{ weekday: 7, starts: '10:00', ends: '19:00' }];
    expect((await save(stylist, original)).error).toBeNull();
    const appt = await insertAppointment({ stylistId: stylist, serviceId: svc, start: new Date(at(11)) });
    expect(appt.error).toBeNull();

    const tooLate = [{ weekday: 7, starts: '13:00', ends: '19:00' }];
    const refused = await save(stylist, tooLate);
    expect(refused.error?.message).toBe('CONFLICT');
    expect(await stylistRows(stylist)).toEqual(original);

    const listed = await conflicts(stylist, tooLate);
    expect(listed.error).toBeNull();
    expect((listed.data ?? []).map((c) => c.appointment_id)).toEqual([appt.data?.id]);

    // Un horario que la contiene (aunque justo) se aplica, y la lista queda vacía.
    const exact = [{ weekday: 7, starts: '11:00', ends: '12:00' }];
    expect((await conflicts(stylist, exact)).data).toEqual([]);
    expect((await save(stylist, exact)).error).toBeNull();
  });

  it('CA-39: un día libre con una cita ese día, y un tramo que la parte, también son conflicto', async () => {
    expect((await save(stylist, [{ weekday: 7, starts: '10:00', ends: '19:00' }])).error).toBeNull();
    await insertAppointment({ stylistId: stylist, serviceId: svc, start: new Date(at(11)) });

    expect((await save(stylist, [{ weekday: 1, starts: '10:00', ends: '19:00' }])).error?.message).toBe('CONFLICT');
    // La cita 11:00–12:00 queda a caballo entre 10:00–11:30 y 11:30–19:00: no cabe en ninguno.
    const split = [
      { weekday: 7, starts: '10:00', ends: '11:30' },
      { weekday: 7, starts: '11:30', ends: '19:00' },
    ];
    expect((await save(stylist, split)).error?.message).toBe('CONFLICT');
  });

  it('una cita cancelada o de otra estilista no bloquea el cambio', async () => {
    expect((await save(stylist, [{ weekday: 7, starts: '10:00', ends: '19:00' }])).error).toBeNull();
    const cancelled = await insertAppointment({ stylistId: stylist, serviceId: svc, start: new Date(at(11)), status: 'cancelled' });
    expect(cancelled.error).toBeNull();
    await insertAppointment({ stylistId: other, serviceId: svc, start: new Date(at(11)) });

    expect((await save(stylist, [{ weekday: 1, starts: '10:00', ends: '19:00' }])).error).toBeNull();
  });

  it('CA-39: el horario del salón comprueba las citas de todas las estilistas', async () => {
    expect((await save(other, [{ weekday: 7, starts: '10:00', ends: '19:00' }])).error).toBeNull();
    const appt = await insertAppointment({ stylistId: other, serviceId: svc, start: new Date(at(11)) });
    expect(appt.error).toBeNull();

    const before = await salonRows();
    const later = [...originalSalon, { weekday: 7, starts: '14:00', ends: '20:00' }];
    expect((await save(null, later)).error?.message).toBe('CONFLICT');
    expect(await salonRows()).toEqual(before);

    const listed = await conflicts(null, later);
    expect((listed.data ?? []).map((c) => c.appointment_id)).toEqual([appt.data?.id]);
    expect((listed.data ?? [])[0]?.stylist_id).toBe(other);
  });

  it('guardar el mismo horario dos veces es idempotente', async () => {
    const ranges = [
      { weekday: 6, starts: '10:00', ends: '14:00' },
      { weekday: 7, starts: '10:00', ends: '14:00' },
    ];
    expect((await save(stylist, ranges)).error).toBeNull();
    expect((await save(stylist, ranges)).error).toBeNull();
    expect(await stylistRows(stylist)).toEqual(ranges);
  });
});
