import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addTimeBlock,
  anonClient,
  cleanup,
  createAdmin,
  createService,
  createStylist,
  createUser,
  daysFromNow,
  insertAppointment,
  range,
  service,
  type TestUser,
} from './helpers/db';

// CA-17 (parte de BD, RF-06 y RNF-03): clienta e invitada no leen ni escriben datos de
// Admin; el Admin sí. La parte de /admin y el e2e llegan con T-008.
describe('acceso-admin (CA-17)', () => {
  let admin: TestUser;
  let clienta: TestUser;
  let stylistId: string;
  let serviceId: string;
  let blockId: string;

  beforeAll(async () => {
    stylistId = await createStylist();
    serviceId = await createService(60);
    admin = await createAdmin();
    clienta = await createUser('clienta');
    blockId = await addTimeBlock(stylistId, daysFromNow(25, 14), 120);
    await insertAppointment({ stylistId, serviceId, start: daysFromNow(25, 10) });
  });

  afterAll(cleanup);

  describe('clienta', () => {
    it('no lee horarios de estilistas ni bloqueos', async () => {
      const sched = await clienta.client.from('stylist_schedule').select('id');
      expect(sched.data ?? []).toEqual([]);
      const blocks = await clienta.client.from('time_blocks').select('id');
      expect(blocks.data ?? []).toEqual([]);
    });

    it('no ve las citas de invitadas', async () => {
      const { data } = await clienta.client.from('appointments').select('id');
      expect(data).toEqual([]);
    });

    it('no puede crear, modificar ni borrar servicios', async () => {
      const ins = await clienta.client
        .from('services')
        .insert({ category: 'X', name: 'Intruso', price_from_cents: 1, duration_min: 10 });
      expect(ins.error).not.toBeNull();

      const upd = await clienta.client
        .from('services')
        .update({ price_from_cents: 1 })
        .eq('id', serviceId)
        .select('id');
      expect(upd.data ?? []).toEqual([]);

      const del = await clienta.client.from('services').delete().eq('id', serviceId).select('id');
      expect(del.data ?? []).toEqual([]);
    });

    it('no puede crear bloqueos de agenda', async () => {
      const { error } = await clienta.client.from('time_blocks').insert({
        stylist_id: stylistId,
        during: range(daysFromNow(26, 10), 60),
      });
      expect(error).not.toBeNull();
    });

    it('no puede cambiarse el rol a admin', async () => {
      const { error } = await clienta.client
        .from('profiles')
        .update({ role: 'admin' })
        .eq('id', clienta.id);
      expect(error?.code).toBe('42501');

      const { data } = await service.from('profiles').select('role').eq('id', clienta.id).single();
      expect(data?.role).toBe('client');
    });

    it('is_admin() es falso para una clienta', async () => {
      const { data } = await clienta.client.rpc('is_admin');
      expect(data).toBe(false);
    });
  });

  describe('invitada (anónimo)', () => {
    it('no lee horarios de estilistas, bloqueos, citas ni perfiles', async () => {
      const anon = anonClient();
      for (const table of ['stylist_schedule', 'time_blocks', 'appointments', 'profiles'] as const) {
        const { data, error } = await anon.from(table).select('id');
        expect(data, table).toBeNull();
        expect(error?.code, table).toBe('42501');
      }
    });

    it('no puede escribir en el catálogo', async () => {
      const { error } = await anonClient()
        .from('services')
        .insert({ category: 'X', name: 'Intruso', price_from_cents: 1, duration_min: 10 });
      expect(error).not.toBeNull();
    });

    it('sí puede leer el catálogo activo y el horario del salón', async () => {
      const anon = anonClient();
      const services = await anon.from('services').select('id').eq('id', serviceId);
      expect(services.data).toHaveLength(1);
      const hours = await anon.from('salon_hours').select('id');
      expect(hours.error).toBeNull();
    });

    it('no ve servicios ni estilistas inactivos', async () => {
      const inactive = await createService(30);
      await service.from('services').update({ active: false }).eq('id', inactive);
      const { data } = await anonClient().from('services').select('id').eq('id', inactive);
      expect(data).toEqual([]);
    });
  });

  describe('admin', () => {
    it('is_admin() es verdadero', async () => {
      const { data } = await admin.client.rpc('is_admin');
      expect(data).toBe(true);
    });

    it('ve las citas de invitadas, los horarios y los bloqueos', async () => {
      const appts = await admin.client.from('appointments').select('id, user_id');
      expect(appts.data?.some((a) => a.user_id === null)).toBe(true);

      const blocks = await admin.client.from('time_blocks').select('id').eq('id', blockId);
      expect(blocks.data).toHaveLength(1);

      const sched = await admin.client.from('stylist_schedule').select('id').limit(1);
      expect(sched.error).toBeNull();
    });

    it('puede crear un bloqueo y modificar un servicio', async () => {
      const block = await admin.client
        .from('time_blocks')
        .insert({ stylist_id: stylistId, during: range(daysFromNow(27, 14), 120), kind: 'break' })
        .select('id')
        .single();
      expect(block.error).toBeNull();
      if (block.data) await service.from('time_blocks').delete().eq('id', block.data.id);

      const upd = await admin.client
        .from('services')
        .update({ price_from_cents: 1234 })
        .eq('id', serviceId)
        .select('price_from_cents')
        .single();
      expect(upd.data?.price_from_cents).toBe(1234);
    });

    it('puede cancelar una cita de cualquier persona', async () => {
      const created = await insertAppointment({
        stylistId,
        serviceId,
        start: daysFromNow(28, 10),
      });
      const upd = await admin.client
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', created.data?.id ?? '')
        .select('status')
        .single();
      expect(upd.data?.status).toBe('cancelled');
    });
  });
});
