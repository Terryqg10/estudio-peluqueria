import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  cleanup,
  createAdmin,
  createService,
  createStylist,
  createUser,
  ensureSalonHours,
  offerService,
  service,
  setSchedule,
} from './helpers/db';
import { madridInstant, sundayDateAhead } from './helpers/time';

// CA-44 y CA-45 (RF-04, RF-10, ADR-0034): reservar con cuenta guarda `user_id` y la copia de contacto.
const SUNDAY = 7;

describe('reserva-cuenta: create_booking con p_user_id (CA-44, CA-45)', () => {
  const date = sundayDateAhead(21);
  const at = (hour: number, minute = 0) => madridInstant(date, hour, minute);
  let stylist: string;
  let svc: string;

  const book = (over: Record<string, unknown> = {}) =>
    service.rpc('create_booking', {
      p_service_id: svc,
      p_stylist_id: stylist,
      p_starts_at: at(10, 30),
      p_guest_name: 'Ana García',
      p_guest_email: `cuenta-${randomUUID()}@test.invalid`,
      p_guest_phone: '+34 600 000 000',
      p_consent_version: 'borrador-1',
      ...over,
    });

  beforeAll(async () => {
    await ensureSalonHours(SUNDAY, '10:00', '20:00');
    stylist = await createStylist('Estilista cuenta');
    svc = await createService(15);
    await setSchedule(stylist, SUNDAY, '10:00', '14:00');
    await offerService(stylist, svc);
  });

  afterAll(async () => {
    await service.from('appointments').delete().like('guest_email', '%@test.invalid');
    await cleanup();
  });

  it('CA-44: la cita se guarda con user_id Y con la copia de contacto, y aparece solo en las citas de esa clienta', async () => {
    const user = await createUser('reserva-cuenta');
    const other = await createUser('reserva-cuenta-otra');
    const { data, error } = await book({ p_user_id: user.id, p_guest_email: user.email, p_starts_at: at(10, 0) });
    expect(error).toBeNull();
    const id = data![0]!.appointment_id;

    const { data: row } = await service.from('appointments').select('*').eq('id', id).single();
    expect(row).toMatchObject({
      user_id: user.id,
      guest_name: 'Ana García',
      guest_email: user.email,
      guest_phone: '+34 600 000 000',
      status: 'confirmed',
      consent_version: 'borrador-1',
    });
    expect(row?.consent_at).not.toBeNull();

    const mine = await user.client.from('appointments').select('id').eq('id', id);
    expect(mine.data).toEqual([{ id }]);
    const theirs = await other.client.from('appointments').select('id').eq('id', id);
    expect(theirs.data).toEqual([]);
  });

  it('sin p_user_id sigue siendo una reserva de invitada (user_id nulo)', async () => {
    const { data, error } = await book({ p_starts_at: at(10, 15) });
    expect(error).toBeNull();
    const { data: row } = await service.from('appointments').select('user_id, guest_email').eq('id', data![0]!.appointment_id).single();
    expect(row?.user_id).toBeNull();
    expect(row?.guest_email).toMatch(/@test\.invalid$/);
  });

  it('una cuenta inexistente se rechaza con INVALID_INPUT y no crea la cita', async () => {
    const email = `fantasma-${randomUUID()}@test.invalid`;
    const { error } = await book({ p_user_id: randomUUID(), p_guest_email: email, p_starts_at: at(11, 0) });
    expect(error?.message).toBe('INVALID_INPUT');
    const { data } = await service.from('appointments').select('id').eq('guest_email', email);
    expect(data).toEqual([]);
  });

  it('CA-45: los límites por email se aplican igual a las citas de cuenta', async () => {
    const user = await createUser('reserva-cuenta-limite');
    const slots = [at(11, 15), at(11, 30), at(11, 45)];
    for (const start of slots) {
      const ok = await book({ p_user_id: user.id, p_guest_email: user.email, p_starts_at: start });
      expect(ok.error).toBeNull();
    }
    const over = await book({ p_user_id: user.id, p_guest_email: user.email, p_starts_at: at(12, 0) });
    expect(over.error?.message).toBe('LIMIT_EMAIL');
  });

  it('mantiene la validación (consentimiento, solape, formato) con p_user_id', async () => {
    const user = await createUser('reserva-cuenta-valida');
    const noConsent = await book({ p_user_id: user.id, p_guest_email: user.email, p_consent_version: '', p_starts_at: at(12, 15) });
    expect(noConsent.error?.message).toBe('INVALID_INPUT');

    const first = await book({ p_user_id: user.id, p_guest_email: user.email, p_starts_at: at(12, 30) });
    expect(first.error).toBeNull();
    const clash = await book({ p_starts_at: at(12, 30) });
    expect(clash.error?.message).toBe('SLOT_TAKEN');
  });

  it('solo service_role puede ejecutarla: anónimo y clienta no pueden reservar a nombre de otra cuenta', async () => {
    const victim = await createUser('reserva-cuenta-victima');
    const attacker = await createUser('reserva-cuenta-atacante');
    for (const client of [anonClient(), attacker.client]) {
      const { error } = await client.rpc('create_booking', {
        p_service_id: svc,
        p_stylist_id: stylist,
        p_starts_at: at(13, 0),
        p_guest_name: 'Intruso',
        p_guest_email: `intruso-${randomUUID()}@test.invalid`,
        p_guest_phone: '+34 600 000 000',
        p_consent_version: 'borrador-1',
        p_user_id: victim.id,
      });
      expect(error).not.toBeNull();
    }
    const { data } = await service.from('appointments').select('id').eq('user_id', victim.id);
    expect(data).toEqual([]);
  });

  it('CA-44: el Admin ve nombre, email y teléfono de la cita de cuenta con su sesión (RLS), sin leer auth.users', async () => {
    const user = await createUser('reserva-cuenta-admin');
    const admin = await createAdmin();
    const { data } = await book({ p_user_id: user.id, p_guest_email: user.email, p_starts_at: at(13, 30) });
    const id = data![0]!.appointment_id;

    const { data: row, error } = await admin.client
      .from('appointments')
      .select('user_id, guest_name, guest_email, guest_phone')
      .eq('id', id)
      .single();
    expect(error).toBeNull();
    expect(row).toEqual({
      user_id: user.id,
      guest_name: 'Ana García',
      guest_email: user.email,
      guest_phone: '+34 600 000 000',
    });
  });

  it('el borrado de la cuenta (T-012) anonimiza esas citas, también la copia de contacto', async () => {
    const user = await createUser('reserva-cuenta-borrado');
    const { data } = await book({ p_user_id: user.id, p_guest_email: user.email, p_starts_at: at(13, 15) });
    const id = data![0]!.appointment_id;

    expect((await service.rpc('delete_account_data', { p_user_id: user.id })).error).toBeNull();
    const { data: row } = await service.from('appointments').select('*').eq('id', id).single();
    expect(row?.anonymized_at).not.toBeNull();
    expect([row?.user_id, row?.guest_name, row?.guest_email, row?.guest_phone]).toEqual([null, null, null, null]);
  });
});
