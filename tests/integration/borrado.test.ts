import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  cleanup,
  createService,
  createStylist,
  createUser,
  daysFromNow,
  insertAppointment,
  service,
} from './helpers/db';

// CA-26 (RF-09, ADR-0030): al pedir el borrado, los datos personales se eliminan o anonimizan y las
// citas dejan de ser identificables.
describe('borrado (CA-26)', () => {
  let stylistId: string;
  let serviceId: string;

  beforeAll(async () => {
    stylistId = await createStylist();
    serviceId = await createService(60);
  });

  afterAll(cleanup);

  async function guestAppointment(email: string, days: number, hour = 10) {
    const created = await insertAppointment({
      stylistId,
      serviceId,
      start: daysFromNow(days, hour),
      guestEmail: email,
    });
    const id = created.data?.id ?? '';
    expect(id).not.toBe('');
    const issued = await service.rpc('issue_management_token', { p_appointment_id: id });
    return { id, token: issued.data ?? '' };
  }

  async function row(id: string) {
    const { data, error } = await service.from('appointments').select('*').eq('id', id).single();
    expect(error).toBeNull();
    return data!;
  }

  describe('invitada con el token de su cita', () => {
    it('anonimiza todas sus citas, cancela las futuras y el token deja de valer', async () => {
      const email = `borrar-${randomUUID()}@test.invalid`;
      const futureA = await guestAppointment(email, 30, 10);
      const futureB = await guestAppointment(email, 31, 10);
      const past = await guestAppointment(email, -10, 10);
      // Una nota interna del Admin con texto libre también debe desaparecer.
      await service.from('appointment_notes').insert({ appointment_id: futureA.id, note: 'Alérgica a X' });

      const result = await anonClient().rpc('delete_guest_data', { p_token: futureA.token });
      expect(result.error).toBeNull();
      expect(result.data).toBe(3);

      for (const id of [futureA.id, futureB.id, past.id]) {
        const a = await row(id);
        expect(a.anonymized_at).not.toBeNull();
        expect(a.guest_name).toBeNull();
        expect(a.guest_email).toBeNull();
        expect(a.guest_phone).toBeNull();
        expect(a.user_id).toBeNull();
        expect(a.consent_at).toBeNull();
        expect(a.consent_version).toBeNull();
      }
      expect((await row(futureA.id)).status).toBe('cancelled');
      expect((await row(futureB.id)).status).toBe('cancelled');
      expect((await row(past.id)).status).toBe('confirmed');

      const tokens = await service
        .from('appointment_tokens')
        .select('appointment_id')
        .in('appointment_id', [futureA.id, futureB.id, past.id]);
      expect(tokens.data).toEqual([]);
      const notes = await service.from('appointment_notes').select('appointment_id').eq('appointment_id', futureA.id);
      expect(notes.data).toEqual([]);

      const again = await anonClient().rpc('get_guest_appointment', { p_token: futureA.token });
      expect(again.error?.message).toBe('INVALID_TOKEN');
    });

    it('no toca las citas de otra persona', async () => {
      const mine = await guestAppointment(`mia-${randomUUID()}@test.invalid`, 40, 10);
      const other = await guestAppointment(`otra-${randomUUID()}@test.invalid`, 40, 12);

      const result = await anonClient().rpc('delete_guest_data', { p_token: mine.token });
      expect(result.data).toBe(1);

      const untouched = await row(other.id);
      expect(untouched.anonymized_at).toBeNull();
      expect(untouched.guest_email).not.toBeNull();
      expect(untouched.status).toBe('confirmed');
    });

    it('repetir con el mismo token o usar uno inválido da INVALID_TOKEN', async () => {
      const { token } = await guestAppointment(`repetir-${randomUUID()}@test.invalid`, 41, 10);
      expect((await anonClient().rpc('delete_guest_data', { p_token: token })).error).toBeNull();
      expect((await anonClient().rpc('delete_guest_data', { p_token: token })).error?.message).toBe('INVALID_TOKEN');
      expect((await anonClient().rpc('delete_guest_data', { p_token: 'corto' })).error?.message).toBe('INVALID_TOKEN');
      const unknown = 'A'.repeat(43);
      expect((await anonClient().rpc('delete_guest_data', { p_token: unknown })).error?.message).toBe('INVALID_TOKEN');
    });

    it('libera el hueco de la cita futura cancelada', async () => {
      const { id, token } = await guestAppointment(`hueco-${randomUUID()}@test.invalid`, 42, 10);
      await anonClient().rpc('delete_guest_data', { p_token: token });
      const again = await insertAppointment({ stylistId, serviceId, start: daysFromNow(42, 10) });
      expect(again.error).toBeNull();
      expect((await row(id)).status).toBe('cancelled');
    });
  });

  describe('clienta con cuenta', () => {
    it('anonimiza sus citas, limpia el perfil y deja intactas las de otra clienta', async () => {
      const a = await createUser('borrar-a');
      const b = await createUser('borrar-b');
      await service.from('profiles').update({ full_name: 'Ana', phone: '+34611111111' }).eq('id', a.id);
      await service.from('profiles').update({ full_name: 'Bea', phone: '+34622222222' }).eq('id', b.id);
      const mineFuture = await insertAppointment({ stylistId, serviceId, start: daysFromNow(50, 10), userId: a.id });
      const minePast = await insertAppointment({ stylistId, serviceId, start: daysFromNow(-20, 10), userId: a.id });
      const others = await insertAppointment({ stylistId, serviceId, start: daysFromNow(50, 12), userId: b.id });

      const result = await service.rpc('delete_account_data', { p_user_id: a.id });
      expect(result.error).toBeNull();
      expect(result.data).toBe(2);

      const future = await row(mineFuture.data!.id);
      expect(future.user_id).toBeNull();
      expect(future.anonymized_at).not.toBeNull();
      expect(future.status).toBe('cancelled');
      expect((await row(minePast.data!.id)).status).toBe('confirmed');

      const profile = await service.from('profiles').select('full_name, phone').eq('id', a.id).single();
      expect(profile.data).toEqual({ full_name: null, phone: null });

      // La cuenta se puede eliminar después: user_id ya es null y la restricción no falla.
      const deleted = await service.auth.admin.deleteUser(a.id);
      expect(deleted.error).toBeNull();
      expect((await row(mineFuture.data!.id)).anonymized_at).not.toBeNull();

      const other = await row(others.data!.id);
      expect(other.user_id).toBe(b.id);
      expect(other.anonymized_at).toBeNull();
      const otherProfile = await service.from('profiles').select('full_name').eq('id', b.id).single();
      expect(otherProfile.data?.full_name).toBe('Bea');
    });

    it('repetir es inocuo', async () => {
      const u = await createUser('borrar-repite');
      await insertAppointment({ stylistId, serviceId, start: daysFromNow(60, 10), userId: u.id });
      expect((await service.rpc('delete_account_data', { p_user_id: u.id })).data).toBe(1);
      const second = await service.rpc('delete_account_data', { p_user_id: u.id });
      expect(second.error).toBeNull();
      expect(second.data).toBe(0);
    });
  });

  describe('permisos', () => {
    it('anónimo y clienta no pueden borrar datos ajenos ni lanzar las funciones de servicio', async () => {
      const victim = await createUser('borrar-victima');
      const attacker = await createUser('borrar-atacante');
      const appt = await insertAppointment({ stylistId, serviceId, start: daysFromNow(70, 10), userId: victim.id });

      for (const client of [anonClient(), attacker.client]) {
        const del = await client.rpc('delete_account_data', { p_user_id: victim.id });
        expect(del.error).not.toBeNull();
        const ret = await client.rpc('anonymize_expired_data', { p_months: 1 });
        expect(ret.error).not.toBeNull();
        const helper = await client.rpc('anonymize_person', { p_user_id: victim.id, p_guest_email: '' });
        expect(helper.error).not.toBeNull();
      }
      expect((await row(appt.data!.id)).user_id).toBe(victim.id);
    });

    it('la BD impide una cita anonimizada con datos personales', async () => {
      const created = await insertAppointment({ stylistId, serviceId, start: daysFromNow(80, 10) });
      const { error } = await service
        .from('appointments')
        .update({ anonymized_at: new Date().toISOString() })
        .eq('id', created.data!.id);
      expect(error?.message).toContain('appointments_anonymized_has_no_pii');
    });
  });
});
