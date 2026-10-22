import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

// admin_reschedule_appointment, admin_cancel_appointment y admin_appointment_availability
// (ADR-0026, T-008c, RF-06, CA-16). Domingo con horario 10:00–14:00 y servicio de 60 min.
const SUNDAY = 7;

describe('admin-citas: mover y cancelar como Admin', () => {
  const date = sundayDateAhead(21);
  const at = (hour: number, minute = 0) => madridInstant(date, hour, minute);

  let svc = '';
  let admin: TestUser;
  let clienta: TestUser;
  let stylistA = '';
  let stylistB = '';
  let stylistC = '';

  beforeAll(async () => {
    await ensureSalonHours(SUNDAY, '10:00', '20:00');
    svc = await createService(60);
    admin = await createAdmin();
    clienta = await createUser('clienta');
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

  const move = (id: string, stylistId: string, startsAt: string) =>
    admin.client.rpc('admin_reschedule_appointment', {
      p_appointment_id: id,
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

  describe('permisos', () => {
    it('una clienta, una invitada y un anónimo reciben FORBIDDEN o no pueden ejecutar las funciones', async () => {
      const { id } = await appointment(stylistA, new Date(at(10)));
      const callers = [clienta.client, anonClient()];
      for (const client of callers) {
        const m = await client.rpc('admin_reschedule_appointment', {
          p_appointment_id: id,
          p_stylist_id: stylistA,
          p_starts_at: at(12),
        });
        const c = await client.rpc('admin_cancel_appointment', { p_appointment_id: id });
        const a = await client.rpc('admin_appointment_availability', { p_appointment_id: id, p_date: date });
        for (const result of [m, c, a]) {
          expect(result.error).not.toBeNull();
          expect(result.data ?? null).toBeNull();
        }
      }
      // Ninguna llamada cambió la cita.
      expect((await row(id))?.status).toBe('confirmed');
      expect((await row(id))?.stylist_id).toBe(stylistA);
    });

    it('la clienta autenticada recibe FORBIDDEN (no «no existe»)', async () => {
      const { id } = await appointment(stylistA, new Date(at(10)));
      const { error } = await clienta.client.rpc('admin_cancel_appointment', { p_appointment_id: id });
      expect(error?.message).toBe('FORBIDDEN');
    });
  });

  describe('mover', () => {
    it('mueve la misma cita a un hueco libre y libera el antiguo', async () => {
      const { id } = await appointment(stylistA, new Date(at(10)));
      const { data, error } = await move(id, stylistA, at(12));
      expect(error).toBeNull();
      expect(data?.[0]?.id).toBe(id);

      const after = await row(id);
      expect(after?.stylist_id).toBe(stylistA);
      expect(after?.status).toBe('confirmed');

      const reuse = await insertAppointment({ stylistId: stylistA, serviceId: svc, start: new Date(at(10)) });
      expect(reuse.error).toBeNull();
    });

    it('cambia de estilista', async () => {
      const { id } = await appointment(stylistA, new Date(at(10)));
      const { error } = await move(id, stylistB, at(10));
      expect(error).toBeNull();
      expect((await row(id))?.stylist_id).toBe(stylistB);
    });

    it('mueve una cita con menos de 24 h (la regla de la clienta no vale para el Admin)', async () => {
      const soon = new Date(Date.now() + 5 * 3_600_000);
      soon.setUTCSeconds(0, 0);
      const { id, token } = await appointment(stylistA, soon);

      // La clienta no puede (TOO_LATE) pero el Admin sí.
      const guest = await anonClient().rpc('reschedule_guest_appointment', {
        p_token: token,
        p_stylist_id: stylistA,
        p_starts_at: at(12),
      });
      expect(guest.error?.message).toBe('TOO_LATE');

      const { error } = await move(id, stylistA, at(12));
      expect(error).toBeNull();
    });

    it('el enlace de la clienta sigue valiendo y caduca al nuevo inicio', async () => {
      const { id, token } = await appointment(stylistA, new Date(at(10)));
      expect((await move(id, stylistA, at(12))).error).toBeNull();

      const { data } = await service
        .from('appointment_tokens')
        .select('expires_at')
        .eq('appointment_id', id)
        .single();
      expect(new Date(data?.expires_at ?? '').toISOString()).toBe(new Date(at(12)).toISOString());
      const viewed = await anonClient().rpc('get_guest_appointment', { p_token: token });
      expect(viewed.error).toBeNull();
    });

    it('rechaza un solape, un hueco no ofrecido y una estilista que no hace el servicio', async () => {
      const first = await appointment(stylistA, new Date(at(10)));
      await appointment(stylistA, new Date(at(12)));

      // Solape con otra cita.
      expect((await move(first.id, stylistA, at(12))).error?.message).toBe('SLOT_TAKEN');
      // Fuera del horario de la estilista (14:00 es el cierre).
      expect((await move(first.id, stylistA, at(14))).error?.message).toBe('SLOT_TAKEN');
      // Estilista que no hace el servicio.
      expect((await move(first.id, stylistC, at(11))).error?.message).toBe('INVALID_SELECTION');

      expect((await row(first.id))?.stylist_id).toBe(stylistA);
    });

    it('NO_CHANGE, NOT_FOUND e INVALID_STATE', async () => {
      const { id } = await appointment(stylistA, new Date(at(10)));
      expect((await move(id, stylistA, at(10))).error?.message).toBe('NO_CHANGE');
      expect((await move('00000000-0000-0000-0000-000000000000', stylistA, at(12))).error?.message).toBe(
        'NOT_FOUND',
      );

      await admin.client.rpc('admin_cancel_appointment', { p_appointment_id: id });
      expect((await move(id, stylistA, at(12))).error?.message).toBe('INVALID_STATE');
    });

    it('dos movimientos simultáneos al mismo hueco: uno gana y el otro recibe SLOT_TAKEN', async () => {
      const one = await appointment(stylistA, new Date(at(10)));
      const two = await appointment(stylistB, new Date(at(10)));
      const results = await Promise.all([move(one.id, stylistA, at(12)), move(two.id, stylistA, at(12))]);
      const errors = results.map((r) => r.error?.message ?? null);
      expect(errors.filter((e) => e === null)).toHaveLength(1);
      expect(errors.filter((e) => e === 'SLOT_TAKEN')).toHaveLength(1);
    });
  });

  describe('huecos para mover', () => {
    it('incluye el hueco de la propia cita y excluye los ocupados por otras', async () => {
      const mine = await appointment(stylistA, new Date(at(10)));
      await appointment(stylistA, new Date(at(11)));
      const { data, error } = await admin.client.rpc('admin_appointment_availability', {
        p_appointment_id: mine.id,
        p_date: date,
      });
      expect(error).toBeNull();
      const forA = (data ?? [])
        .filter((s) => s.stylist_id === stylistA)
        .map((s) => new Date(s.starts_at).toISOString());
      expect(forA).toContain(new Date(at(10)).toISOString());
      expect(forA).not.toContain(new Date(at(11)).toISOString());
    });
  });

  describe('cancelar', () => {
    it('cancela, libera el hueco y una segunda cancelación da INVALID_STATE', async () => {
      const { id } = await appointment(stylistA, new Date(at(10)));
      const { data, error } = await admin.client.rpc('admin_cancel_appointment', { p_appointment_id: id });
      expect(error).toBeNull();
      expect(data?.[0]?.status).toBe('cancelled');
      expect((await row(id))?.status).toBe('cancelled');

      const reuse = await insertAppointment({ stylistId: stylistA, serviceId: svc, start: new Date(at(10)) });
      expect(reuse.error).toBeNull();

      const again = await admin.client.rpc('admin_cancel_appointment', { p_appointment_id: id });
      expect(again.error?.message).toBe('INVALID_STATE');
    });

    it('cancela también una cita con menos de 24 h', async () => {
      const soon = new Date(Date.now() + 5 * 3_600_000);
      soon.setUTCSeconds(0, 0);
      const { id } = await appointment(stylistA, soon);
      expect((await admin.client.rpc('admin_cancel_appointment', { p_appointment_id: id })).error).toBeNull();
    });
  });
});
