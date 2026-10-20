import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

// reschedule_guest_appointment y get_guest_reschedule_availability (ADR-0019, T-006c, RF-05).
// Domingo con horario 10:00–14:00 y servicio de 60 min; estilistas A y B lo hacen, C no.
const SUNDAY = 7;

describe('reprogramar: reschedule_guest_appointment', () => {
  const date = sundayDateAhead(21);
  const at = (hour: number, minute = 0) => madridInstant(date, hour, minute);

  let svc: string;
  // Estilista A y B hacen el servicio; la C no. Cada test crea las suyas para no chocar con los demás.
  let stylistA = '';
  let stylistB = '';
  let stylistC = '';

  beforeAll(async () => {
    await ensureSalonHours(SUNDAY, '10:00', '20:00');
    svc = await createService(60);
  });

  beforeEach(async () => {
    stylistA = await createStylist('Estilista A');
    stylistB = await createStylist('Estilista B');
    stylistC = await createStylist('Estilista C'); // no hace el servicio
    for (const id of [stylistA, stylistB, stylistC]) await setSchedule(id, SUNDAY, '10:00', '14:00');
    await offerService(stylistA, svc);
    await offerService(stylistB, svc);
  });

  afterAll(cleanup);

  async function appointment(stylistId: string, start: Date) {
    const created = await insertAppointment({ stylistId, serviceId: svc, start });
    const id = created.data?.id ?? '';
    const issued = await service.rpc('issue_management_token', { p_appointment_id: id });
    return { id, token: issued.data ?? '' };
  }

  const move = (token: string, stylistId: string, startsAt: string) =>
    anonClient().rpc('reschedule_guest_appointment', {
      p_token: token,
      p_stylist_id: stylistId,
      p_starts_at: startsAt,
    });

  async function row(id: string) {
    const { data } = await service
      .from('appointments')
      .select('stylist_id, during, status')
      .eq('id', id)
      .single();
    return data;
  }

  it('mueve la cita a un hueco libre: misma cita, el hueco antiguo queda libre', async () => {
    const { id, token } = await appointment(stylistA, new Date(at(10)));
    const { data, error } = await move(token, stylistA, at(12));
    expect(error).toBeNull();
    expect(data?.[0]?.id).toBe(id);
    expect(new Date(data?.[0]?.starts_at ?? '').toISOString()).toBe(new Date(at(12)).toISOString());

    const after = await row(id);
    expect(after?.stylist_id).toBe(stylistA);
    expect(after?.status).toBe('confirmed');

    // El hueco antiguo está libre: otra cita puede ocupar las 10:00.
    const reuse = await insertAppointment({ stylistId: stylistA, serviceId: svc, start: new Date(at(10)) });
    expect(reuse.error).toBeNull();
  });

  it('el mismo token sigue valiendo y su caducidad pasa al nuevo inicio', async () => {
    const { id, token } = await appointment(stylistA, new Date(at(10, 0)));
    await move(token, stylistA, at(13, 0));

    const got = await anonClient().rpc('get_guest_appointment', { p_token: token });
    expect(got.error).toBeNull();
    expect(new Date(got.data?.[0]?.starts_at ?? '').toISOString()).toBe(new Date(at(13, 0)).toISOString());

    const tokenRow = await service.from('appointment_tokens').select('expires_at').eq('appointment_id', id).single();
    expect(new Date(tokenRow.data?.expires_at ?? '').toISOString()).toBe(new Date(at(13, 0)).toISOString());
  });

  it('puede moverse a un hueco que solapa con su propio hueco actual', async () => {
    const { token } = await appointment(stylistA, new Date(at(10, 0)));
    const { error } = await move(token, stylistA, at(10, 30)); // 10:30–11:30 solapa con 10:00–11:00
    expect(error).toBeNull();
    const got = await anonClient().rpc('get_guest_appointment', { p_token: token });
    expect(new Date(got.data?.[0]?.starts_at ?? '').toISOString()).toBe(new Date(at(10, 30)).toISOString());
  });

  it('cambia de estilista', async () => {
    const { id, token } = await appointment(stylistA, new Date(at(10)));
    const { error } = await move(token, stylistB, at(10));
    expect(error).toBeNull();
    expect((await row(id))?.stylist_id).toBe(stylistB);
  });

  it('SLOT_TAKEN si el hueco está ocupado, y la cita no cambia', async () => {
    await appointment(stylistA, new Date(at(11)));
    const { id, token } = await appointment(stylistA, new Date(at(13)));
    const before = await row(id);

    const { error } = await move(token, stylistA, at(11));
    expect(error?.message).toBe('SLOT_TAKEN');
    expect(await row(id)).toEqual(before);
  });

  it('SLOT_TAKEN fuera del horario de la estilista (15:00 en domingo)', async () => {
    const { token } = await appointment(stylistA, new Date(at(10)));
    const { error } = await move(token, stylistA, at(15));
    expect(error?.message).toBe('SLOT_TAKEN');
  });

  it('INVALID_SELECTION si la estilista no hace el servicio', async () => {
    const { token } = await appointment(stylistA, new Date(at(10)));
    const { error } = await move(token, stylistC, at(11));
    expect(error?.message).toBe('INVALID_SELECTION');
  });

  it('OUT_OF_WINDOW si el nuevo hueco es dentro de menos de 2 h o de más de 60 días', async () => {
    const { token } = await appointment(stylistA, new Date(at(10)));
    const soon = new Date(Date.now() + 60 * 60_000).toISOString();
    const far = new Date(Date.now() + 70 * 24 * 60 * 60_000).toISOString();
    expect((await move(token, stylistA, soon)).error?.message).toBe('OUT_OF_WINDOW');
    expect((await move(token, stylistA, far)).error?.message).toBe('OUT_OF_WINDOW');
  });

  it('NO_CHANGE si se pide el mismo hueco y la misma estilista', async () => {
    const { token } = await appointment(stylistA, new Date(at(10)));
    expect((await move(token, stylistA, at(10))).error?.message).toBe('NO_CHANGE');
  });

  it('CA-14: con menos de 24 h para la cita original se rechaza con TOO_LATE y no cambia', async () => {
    const soon = new Date(Date.now() + 3 * 60 * 60_000);
    soon.setUTCSeconds(0, 0);
    const { id, token } = await appointment(stylistC, soon);
    const before = await row(id);

    const { error } = await move(token, stylistA, at(10));
    expect(error?.message).toBe('TOO_LATE');
    expect(await row(id)).toEqual(before);
  });

  it('un token falso o mal formado da INVALID_TOKEN, nunca TOO_LATE ni SLOT_TAKEN', async () => {
    const forged = await move('A'.repeat(43), stylistA, at(10));
    const short = await move('corto', stylistA, at(10));
    expect(forged.error?.message).toBe('INVALID_TOKEN');
    expect(short.error?.message).toBe('INVALID_TOKEN');
  });

  it('el token de una cita no mueve la de otra persona', async () => {
    const mine = await appointment(stylistA, new Date(at(10)));
    const other = await appointment(stylistB, new Date(at(10)));
    const before = await row(other.id);

    await move(mine.token, stylistA, at(12));
    expect(await row(other.id)).toEqual(before);
  });

  it('una cita cancelada no se puede mover con su token', async () => {
    const { id, token } = await appointment(stylistA, new Date(at(10)));
    await service.from('appointments').update({ status: 'cancelled' }).eq('id', id);
    expect((await move(token, stylistA, at(12))).error?.message).toBe('INVALID_TOKEN');
  });

  it('CA-08/CA-09: dos citas que piden a la vez el mismo hueco: una gana y la otra recibe SLOT_TAKEN', async () => {
    const one = await appointment(stylistA, new Date(at(10)));
    const two = await appointment(stylistB, new Date(at(10)));
    const [a, b] = await Promise.all([move(one.token, stylistA, at(13)), move(two.token, stylistA, at(13))]);
    const errors = [a.error?.message, b.error?.message].filter(Boolean);
    expect(errors).toEqual(['SLOT_TAKEN']);
    expect([a.error, b.error].filter((e) => e === null)).toHaveLength(1);
  });

  it('anon no puede llamar a availability_core', async () => {
    const { error } = await anonClient().rpc('availability_core', {
      p_service_id: svc,
      p_date: date,
      p_stylist_id: stylistA,
      p_exclude_appointment: '00000000-0000-0000-0000-000000000000',
    });
    expect(error).not.toBeNull();
  });
});

describe('reprogramar: huecos disponibles', () => {
  const date = sundayDateAhead(28);
  const at = (hour: number, minute = 0) => madridInstant(date, hour, minute);
  let stylistA: string;
  let svc: string;

  beforeAll(async () => {
    await ensureSalonHours(SUNDAY, '10:00', '20:00');
    stylistA = await createStylist('Estilista huecos');
    svc = await createService(60);
    await setSchedule(stylistA, SUNDAY, '10:00', '14:00');
    await offerService(stylistA, svc);
  });

  afterAll(cleanup);

  it('get_availability sigue sin ofrecer los huecos que solapan con una cita (regresión de T-004)', async () => {
    await insertAppointment({ stylistId: stylistA, serviceId: svc, start: new Date(at(10)) });
    const { data, error } = await anonClient().rpc('get_availability', {
      p_service_id: svc,
      p_date: date,
      p_stylist_id: stylistA,
    });
    expect(error).toBeNull();
    const starts = (data ?? []).map((s) => new Date(s.starts_at).toISOString());
    expect(starts).not.toContain(new Date(at(10, 30)).toISOString());
    expect(starts).toContain(new Date(at(11)).toISOString());
  });

  it('para mover la cita sí se ofrecen los huecos que solapan con ella misma', async () => {
    const created = await insertAppointment({ stylistId: stylistA, serviceId: svc, start: new Date(at(12)) });
    const issued = await service.rpc('issue_management_token', { p_appointment_id: created.data?.id ?? '' });
    const { data, error } = await anonClient().rpc('get_guest_reschedule_availability', {
      p_token: issued.data ?? '',
      p_date: date,
    });
    expect(error).toBeNull();
    const starts = (data ?? []).map((s) => new Date(s.starts_at).toISOString());
    expect(starts).toContain(new Date(at(12, 30)).toISOString());
    // La cita de las 10:00 sigue ocupando su hueco.
    expect(starts).not.toContain(new Date(at(10, 30)).toISOString());
  });

  it('con menos de 24 h devuelve TOO_LATE; con token falso, INVALID_TOKEN', async () => {
    const soon = new Date(Date.now() + 3 * 60 * 60_000);
    soon.setUTCSeconds(0, 0);
    const stylist = await createStylist('Estilista pronto');
    const created = await insertAppointment({ stylistId: stylist, serviceId: svc, start: soon });
    const issued = await service.rpc('issue_management_token', { p_appointment_id: created.data?.id ?? '' });

    const late = await anonClient().rpc('get_guest_reschedule_availability', { p_token: issued.data ?? '', p_date: date });
    expect(late.error?.message).toBe('TOO_LATE');
    const bad = await anonClient().rpc('get_guest_reschedule_availability', { p_token: 'A'.repeat(43), p_date: date });
    expect(bad.error?.message).toBe('INVALID_TOKEN');
  });
});
