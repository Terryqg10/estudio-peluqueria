import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  anonClient,
  cleanup,
  createService,
  createStylist,
  createUser,
  ensureSalonHours,
  offerService,
  service,
  setSchedule,
} from './helpers/db';
import { madridInstant, sundayDateAhead } from './helpers/time';

// Límites antiabuso de create_booking (ADR-0020, RF-10, CA-29): citas activas por email y
// reservas por ventana e IP (hash). Domingo con horario 10:00–14:00 y servicio de 15 min.
const SUNDAY = 7;

describe('limite-citas: create_booking (CA-29)', () => {
  const date = sundayDateAhead(35);
  const at = (hour: number, minute = 0) => madridInstant(date, hour, minute);

  let svc: string;
  let stylist = '';
  const createdHashes: string[] = [];

  const newEmail = () => `limite-${randomUUID()}@test.invalid`;
  const newHash = () => {
    const hash = randomBytes(32).toString('hex');
    createdHashes.push(hash);
    return hash;
  };

  const book = (over: Record<string, unknown> = {}) =>
    service.rpc('create_booking', {
      p_service_id: svc,
      p_stylist_id: stylist,
      p_starts_at: at(10),
      p_guest_name: 'Ana García',
      p_guest_email: newEmail(),
      p_guest_phone: '+34 600 000 000',
      p_consent_version: 'borrador-1',
      ...over,
    });

  // Inserta una cita ya hecha para un email (estado y franja a elección), sin pasar por create_booking.
  async function insertFor(email: string, start: Date, status: 'pending' | 'confirmed' | 'completed' | 'no_show' | 'cancelled') {
    const end = new Date(start.getTime() + 15 * 60_000);
    const { data, error } = await service
      .from('appointments')
      .insert({
        stylist_id: stylist,
        service_id: svc,
        during: `[${start.toISOString()},${end.toISOString()})`,
        status,
        guest_name: 'Ana García',
        guest_email: email,
        guest_phone: '+34600000000',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  beforeAll(async () => {
    await ensureSalonHours(SUNDAY, '10:00', '20:00');
    svc = await createService(15);
  });

  // Cada test tiene su estilista: así los huecos de un test no afectan a los demás.
  beforeEach(async () => {
    stylist = await createStylist('Estilista límites');
    await setSchedule(stylist, SUNDAY, '10:00', '14:00');
    await offerService(stylist, svc);
  });

  afterAll(async () => {
    await service.from('appointments').delete().like('guest_email', '%@test.invalid');
    if (createdHashes.length > 0) await service.from('rate_limits').delete().in('key_hash', createdHashes);
    await cleanup();
  });

  describe('por email: citas activas', () => {
    it('con los valores por defecto se admiten 3 citas activas y la 4.ª se rechaza con LIMIT_EMAIL', async () => {
      const email = newEmail();
      for (const minute of [0, 15, 30]) {
        const { error } = await book({ p_guest_email: email, p_starts_at: at(10, minute) });
        expect(error).toBeNull();
      }
      const fourth = await book({ p_guest_email: email, p_starts_at: at(10, 45) });
      expect(fourth.error?.message).toBe('LIMIT_EMAIL');

      const count = await service.from('appointments').select('id', { count: 'exact', head: true }).eq('guest_email', email);
      expect(count.count).toBe(3);
    });

    it('CA-29: tras cancelar una cita activa, la misma persona puede reservar', async () => {
      const email = newEmail();
      const first = await book({ p_guest_email: email, p_starts_at: at(10, 0), p_max_active_per_email: 1 });
      const id = first.data?.[0]?.appointment_id ?? '';
      expect((await book({ p_guest_email: email, p_starts_at: at(10, 15), p_max_active_per_email: 1 })).error?.message).toBe('LIMIT_EMAIL');

      await service.from('appointments').update({ status: 'cancelled' }).eq('id', id);
      const again = await book({ p_guest_email: email, p_starts_at: at(10, 15), p_max_active_per_email: 1 });
      expect(again.error).toBeNull();
    });

    it('las citas canceladas, pasadas, completadas y no asistidas no cuentan como activas', async () => {
      const email = newEmail();
      const past = new Date(Date.now() - 3 * 24 * 60 * 60_000);
      await insertFor(email, past, 'confirmed'); // terminada
      await insertFor(email, new Date(past.getTime() + 60 * 60_000), 'completed');
      await insertFor(email, new Date(past.getTime() + 2 * 60 * 60_000), 'no_show');
      await insertFor(email, new Date(at(11, 0)), 'cancelled'); // futura pero cancelada

      const { error } = await book({ p_guest_email: email, p_starts_at: at(10, 0), p_max_active_per_email: 1 });
      expect(error).toBeNull();
    });

    it('las citas pendientes sí cuentan', async () => {
      const email = newEmail();
      await insertFor(email, new Date(at(11, 0)), 'pending');
      const { error } = await book({ p_guest_email: email, p_starts_at: at(10, 0), p_max_active_per_email: 1 });
      expect(error?.message).toBe('LIMIT_EMAIL');
    });

    it('el email se normaliza igual que al reservar (mayúsculas y espacios)', async () => {
      const email = newEmail();
      await book({ p_guest_email: email, p_starts_at: at(10, 0), p_max_active_per_email: 1 });
      const { error } = await book({
        p_guest_email: `  ${email.toUpperCase()} `,
        p_starts_at: at(10, 15),
        p_max_active_per_email: 1,
      });
      expect(error?.message).toBe('LIMIT_EMAIL');
    });

    it('otra persona (otro email) no queda bloqueada', async () => {
      await book({ p_guest_email: newEmail(), p_starts_at: at(10, 0), p_max_active_per_email: 1 });
      const other = await book({ p_guest_email: newEmail(), p_starts_at: at(10, 15), p_max_active_per_email: 1 });
      expect(other.error).toBeNull();
    });

    it('CA-08/CA-29: dos peticiones simultáneas del mismo email en el máximo −1: solo una se crea', async () => {
      const email = newEmail();
      const [a, b] = await Promise.all([
        book({ p_guest_email: email, p_starts_at: at(10, 0), p_max_active_per_email: 1 }),
        book({ p_guest_email: email, p_starts_at: at(10, 15), p_max_active_per_email: 1 }),
      ]);
      const errors = [a.error?.message, b.error?.message].filter(Boolean);
      expect(errors).toEqual(['LIMIT_EMAIL']);

      const count = await service.from('appointments').select('id', { count: 'exact', head: true }).eq('guest_email', email);
      expect(count.count).toBe(1);
    });
  });

  describe('por IP: reservas por ventana', () => {
    it('con el máximo alcanzado se rechaza con LIMIT_IP; otra IP no queda bloqueada', async () => {
      const ip = newHash();
      for (const minute of [0, 15]) {
        const { error } = await book({ p_ip_hash: ip, p_max_per_ip: 2, p_starts_at: at(10, minute) });
        expect(error).toBeNull();
      }
      const third = await book({ p_ip_hash: ip, p_max_per_ip: 2, p_starts_at: at(10, 30) });
      expect(third.error?.message).toBe('LIMIT_IP');

      const otherIp = await book({ p_ip_hash: newHash(), p_max_per_ip: 2, p_starts_at: at(10, 30) });
      expect(otherIp.error).toBeNull();
    });

    it('cancelar citas NO libera el cupo de IP (cuenta reservas creadas, no citas activas)', async () => {
      const ip = newHash();
      const first = await book({ p_ip_hash: ip, p_max_per_ip: 1, p_starts_at: at(10, 0) });
      await service.from('appointments').update({ status: 'cancelled' }).eq('id', first.data?.[0]?.appointment_id ?? '');
      const again = await book({ p_ip_hash: ip, p_max_per_ip: 1, p_starts_at: at(10, 15) });
      expect(again.error?.message).toBe('LIMIT_IP');
    });

    it('al pasar la ventana se puede volver a reservar y los registros caducados se borran', async () => {
      const ip = newHash();
      // Un registro de hace más de dos ventanas (2 h con 60 min): no cuenta y se borra al escribir.
      const old = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
      await service.from('rate_limits').insert({ kind: 'ip', key_hash: ip, created_at: old });

      const { error } = await book({ p_ip_hash: ip, p_max_per_ip: 1, p_starts_at: at(10, 0) });
      expect(error).toBeNull();

      const rows = await service.from('rate_limits').select('created_at').eq('key_hash', ip);
      expect(rows.data).toHaveLength(1);
      expect(new Date(rows.data?.[0]?.created_at ?? 0).getTime()).toBeGreaterThan(Date.now() - 60_000);
    });

    it('una reserva fallida (hueco ocupado) no consume cupo de IP', async () => {
      const ip = newHash();
      await book({ p_starts_at: at(10, 0) }); // ocupa 10:00 con otra persona
      const taken = await book({ p_ip_hash: ip, p_max_per_ip: 1, p_starts_at: at(10, 0) });
      expect(taken.error?.message).toBe('SLOT_TAKEN');

      const ok = await book({ p_ip_hash: ip, p_max_per_ip: 1, p_starts_at: at(10, 15) });
      expect(ok.error).toBeNull();
    });

    it('sin hash de IP no se aplica el límite por IP ni se guarda nada', async () => {
      for (const minute of [0, 15, 30]) {
        const { error } = await book({ p_max_per_ip: 1, p_starts_at: at(10, minute) });
        expect(error).toBeNull();
      }
    });

    it('un hash de IP con forma inválida se rechaza con INVALID_INPUT', async () => {
      expect((await book({ p_ip_hash: 'corto' })).error?.message).toBe('INVALID_INPUT');
      expect((await book({ p_max_active_per_email: 0 })).error?.message).toBe('INVALID_INPUT');
    });
  });

  describe('aislamiento: rate_limits y create_booking', () => {
    it('anon y clientas no pueden leer, escribir ni borrar rate_limits', async () => {
      const ip = newHash();
      await service.from('rate_limits').insert({ kind: 'ip', key_hash: ip });

      const user = await createUser('limite');
      for (const client of [anonClient(), user.client]) {
        const read = await client.from('rate_limits').select('key_hash').eq('key_hash', ip);
        expect(read.data ?? []).toEqual([]);
        const write = await client.from('rate_limits').insert({ kind: 'ip', key_hash: newHash() });
        expect(write.error).not.toBeNull();
        await client.from('rate_limits').delete().eq('key_hash', ip);
      }
      const still = await service.from('rate_limits').select('id').eq('key_hash', ip);
      expect(still.data).toHaveLength(1);
    });

    it('anon no puede llamar a create_booking (solo service_role)', async () => {
      const { error } = await anonClient().rpc('create_booking', {
        p_service_id: svc,
        p_stylist_id: stylist,
        p_starts_at: at(10),
        p_guest_name: 'Ana García',
        p_guest_email: newEmail(),
        p_guest_phone: '+34 600 000 000',
        p_consent_version: 'borrador-1',
      });
      expect(error).not.toBeNull();
    });
  });
});
