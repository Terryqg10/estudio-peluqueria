import { createHash, randomUUID } from 'node:crypto';
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

// CA-40 y CA-41 (RF-09, RF-10, ADR-0032): la invitada sin enlace válido pide el borrado con su email
// y lo confirma con un enlace de un solo uso.
describe('borrado-por-email (CA-40, CA-41)', () => {
  let stylistId: string;
  let serviceId: string;
  let day = 100;

  beforeAll(async () => {
    stylistId = await createStylist();
    serviceId = await createService(60);
  });

  afterAll(async () => {
    await service.from('deletion_requests').delete().gt('id', 0);
    await cleanup();
  });

  const email = () => `por-email-${randomUUID()}@test.invalid`;

  async function appointment(guestEmail: string, daysAhead: number) {
    day += 1;
    const created = await insertAppointment({
      stylistId,
      serviceId,
      start: daysFromNow(daysAhead === 0 ? day : daysAhead, 10),
      guestEmail,
    });
    expect(created.data?.id).toBeTruthy();
    return created.data!.id;
  }

  async function row(id: string) {
    const { data } = await service.from('appointments').select('*').eq('id', id).single();
    return data!;
  }

  async function request(guestEmail: string) {
    const { data, error } = await service.rpc('request_guest_deletion', { p_email: guestEmail });
    expect(error).toBeNull();
    return data;
  }

  describe('CA-40: solicitar y confirmar', () => {
    it('anonimiza todas las citas de ese email (futuras canceladas, pasadas intactas) y consume el enlace', async () => {
      const e = email();
      const future = await appointment(e, 0);
      const past = await appointment(e, -15);
      const other = await appointment(email(), 0);

      const token = await request(e);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const confirmed = await anonClient().rpc('confirm_guest_deletion', { p_token: token! });
      expect(confirmed.error).toBeNull();
      expect(confirmed.data).toBe(2);

      for (const id of [future, past]) {
        const a = await row(id);
        expect(a.anonymized_at).not.toBeNull();
        expect([a.guest_name, a.guest_email, a.guest_phone, a.consent_at, a.consent_version]).toEqual([
          null, null, null, null, null,
        ]);
      }
      expect((await row(future)).status).toBe('cancelled');
      expect((await row(past)).status).toBe('confirmed');
      expect((await row(other)).anonymized_at).toBeNull();

      // Un solo uso.
      const again = await anonClient().rpc('confirm_guest_deletion', { p_token: token! });
      expect(again.error?.message).toBe('INVALID_TOKEN');
    });

    it('funciona aunque el enlace de la cita ya haya caducado (cita pasada)', async () => {
      const e = email();
      const id = await appointment(e, -40);
      const issued = await service.rpc('issue_management_token', { p_appointment_id: id });
      // El token de la cita caducó: la cita pasada ya no se puede abrir con él.
      await service.from('appointment_tokens').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('appointment_id', id);
      expect((await anonClient().rpc('delete_guest_data', { p_token: issued.data! })).error?.message).toBe('INVALID_TOKEN');

      const token = await request(e);
      expect((await anonClient().rpc('confirm_guest_deletion', { p_token: token! })).data).toBe(1);
      expect((await row(id)).anonymized_at).not.toBeNull();
    });

    it('el email se compara sin distinguir mayúsculas ni espacios', async () => {
      const e = email();
      const id = await appointment(e, 0);
      const token = await request(`  ${e.toUpperCase()} `);
      expect(token).not.toBeNull();
      expect((await anonClient().rpc('confirm_guest_deletion', { p_token: token! })).data).toBe(1);
      expect((await row(id)).anonymized_at).not.toBeNull();
    });
  });

  describe('CA-41: sin pistas, un solo uso y caducidad', () => {
    it('un email sin citas (o ya anonimizadas) devuelve null y no crea ninguna solicitud', async () => {
      const unknown = email();
      expect(await request(unknown)).toBeNull();

      const known = email();
      await appointment(known, 0);
      const token = await request(known);
      await anonClient().rpc('confirm_guest_deletion', { p_token: token! });
      expect(await request(known)).toBeNull();

      const hash = `\\x${createHash('sha256').update(unknown).digest('hex')}`;
      const { data } = await service.from('deletion_requests').select('id').eq('email_hash', hash);
      expect(data).toEqual([]);
    });

    it('la solicitud no guarda el email en claro ni el token (solo hashes)', async () => {
      const e = email();
      await appointment(e, 0);
      const token = (await request(e))!;
      const hash = `\\x${createHash('sha256').update(e).digest('hex')}`;
      const { data } = await service.from('deletion_requests').select('*').eq('email_hash', hash);
      expect(data).toHaveLength(1);
      const text = JSON.stringify(data);
      expect(text).not.toContain(e);
      expect(text).not.toContain(token);
      const tokenHash = `\\x${createHash('sha256').update(token).digest('hex')}`;
      expect(data![0]!.token_hash).toBe(tokenHash);
    });

    it('una solicitud nueva sustituye a la anterior del mismo email', async () => {
      const e = email();
      await appointment(e, 0);
      const first = (await request(e))!;
      const second = (await request(e))!;
      expect(second).not.toBe(first);
      expect((await anonClient().rpc('confirm_guest_deletion', { p_token: first })).error?.message).toBe('INVALID_TOKEN');
      expect((await anonClient().rpc('confirm_guest_deletion', { p_token: second })).error).toBeNull();
    });

    it('caduca a la hora: un token vencido da el mismo error que uno inventado', async () => {
      const e = email();
      const id = await appointment(e, 0);
      const token = (await request(e))!;
      await service.from('deletion_requests').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).gt('id', 0)
        .eq('token_hash', `\\x${createHash('sha256').update(token).digest('hex')}`);

      const expired = await anonClient().rpc('confirm_guest_deletion', { p_token: token });
      const invented = await anonClient().rpc('confirm_guest_deletion', { p_token: 'A'.repeat(43) });
      const malformed = await anonClient().rpc('confirm_guest_deletion', { p_token: 'corto' });
      for (const r of [expired, invented, malformed]) expect(r.error?.message).toBe('INVALID_TOKEN');
      expect((await row(id)).anonymized_at).toBeNull();
    });

    it('un token de un email no sirve para otro', async () => {
      const a = email();
      const b = email();
      const idA = await appointment(a, 0);
      const idB = await appointment(b, 0);
      const token = (await request(a))!;
      await anonClient().rpc('confirm_guest_deletion', { p_token: token });
      expect((await row(idA)).anonymized_at).not.toBeNull();
      expect((await row(idB)).anonymized_at).toBeNull();
    });

    it('no toca las citas de una clienta con cuenta aunque comparta el email', async () => {
      const user = await createUser('por-email-cuenta');
      const accountAppt = await insertAppointment({ stylistId, serviceId, start: daysFromNow(150, 10), userId: user.id });
      const guestAppt = await appointment(user.email, 0);
      const token = (await request(user.email))!;
      await anonClient().rpc('confirm_guest_deletion', { p_token: token });
      expect((await row(guestAppt)).anonymized_at).not.toBeNull();
      expect((await row(accountAppt.data!.id)).user_id).toBe(user.id);
    });
  });

  describe('cupo de solicitudes (CA-41)', () => {
    const hash = () => `${randomUUID()}${randomUUID()}`.replaceAll('-', '');

    it('por email: a la 4.ª solicitud de la hora, LIMIT_EMAIL', async () => {
      const h = hash();
      for (let i = 0; i < 3; i++) {
        expect((await service.rpc('consume_deletion_request_quota', { p_email_hash: h })).error).toBeNull();
      }
      const over = await service.rpc('consume_deletion_request_quota', { p_email_hash: h });
      expect(over.error?.message).toBe('LIMIT_EMAIL');
      // Otro email no queda bloqueado.
      expect((await service.rpc('consume_deletion_request_quota', { p_email_hash: hash() })).error).toBeNull();
    });

    it('por IP: con el máximo alcanzado, LIMIT_IP', async () => {
      const ip = hash();
      for (let i = 0; i < 10; i++) {
        expect((await service.rpc('consume_deletion_request_quota', { p_email_hash: hash(), p_ip_hash: ip })).error).toBeNull();
      }
      const over = await service.rpc('consume_deletion_request_quota', { p_email_hash: hash(), p_ip_hash: ip });
      expect(over.error?.message).toBe('LIMIT_IP');
    });

    it('una entrada con mala forma da INVALID_INPUT', async () => {
      const { error } = await service.rpc('consume_deletion_request_quota', { p_email_hash: 'corto' });
      expect(error?.message).toBe('INVALID_INPUT');
    });
  });

  describe('permisos', () => {
    it('anónimo y clienta no pueden pedir tokens ni usar el cupo; sí pueden confirmar con uno válido', async () => {
      const attacker = await createUser('por-email-atacante');
      const e = email();
      await appointment(e, 0);
      for (const client of [anonClient(), attacker.client]) {
        expect((await client.rpc('request_guest_deletion', { p_email: e })).error).not.toBeNull();
        expect(
          (await client.rpc('consume_deletion_request_quota', { p_email_hash: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '') })).error,
        ).not.toBeNull();
        const direct = await client.from('deletion_requests').select('id');
        expect(direct.data ?? []).toEqual([]);
      }
    });

    it('la retención purga las solicitudes caducadas', async () => {
      const e = email();
      await appointment(e, 0);
      const token = (await request(e))!;
      const tokenHash = `\\x${createHash('sha256').update(token).digest('hex')}`;
      await service.from('deletion_requests').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('token_hash', tokenHash);
      await service.rpc('anonymize_expired_data', { p_months: 24 });
      const { data } = await service.from('deletion_requests').select('id').eq('token_hash', tokenHash);
      expect(data).toEqual([]);
    });
  });
});
