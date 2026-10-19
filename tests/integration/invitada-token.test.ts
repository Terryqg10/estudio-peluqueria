import { createHash } from 'node:crypto';
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

// ADR-0009: la invitada gestiona su cita con un token de 256 bits guardado como hash,
// mediante funciones security definer. CA-11 y CA-14 se cierran en T-006; aquí se
// prueba la función de BD: cancela la suya, no la de otra, sin revelar nada.
describe('invitada-token (ADR-0009)', () => {
  let stylistId: string;
  let serviceId: string;

  beforeAll(async () => {
    stylistId = await createStylist();
    serviceId = await createService(60);
  });

  afterAll(cleanup);

  async function guestAppointment(daysAhead: number, hour = 10) {
    const created = await insertAppointment({
      stylistId,
      serviceId,
      start: daysFromNow(daysAhead, hour),
    });
    const id = created.data?.id ?? '';
    const issued = await service.rpc('issue_management_token', { p_appointment_id: id });
    return { id, token: issued.data ?? '' };
  }

  it('el token tiene 256 bits (43 caracteres base64url) y no se guarda en claro', async () => {
    const { id, token } = await guestAppointment(30);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const { data } = await service
      .from('appointment_tokens')
      .select('token_hash')
      .eq('appointment_id', id)
      .single();
    const expected = `\\x${createHash('sha256').update(token).digest('hex')}`;
    expect(data?.token_hash).toBe(expected);
    expect(JSON.stringify(data)).not.toContain(token);
  });

  it('la invitada consulta su cita con el token', async () => {
    const { id, token } = await guestAppointment(31);
    const { data, error } = await anonClient().rpc('get_guest_appointment', { p_token: token });
    expect(error).toBeNull();
    expect(data?.[0]?.id).toBe(id);
    expect(data?.[0]?.status).toBe('confirmed');
  });

  it('la invitada cancela su cita con su token', async () => {
    const { id, token } = await guestAppointment(32);
    const { data, error } = await anonClient().rpc('cancel_guest_appointment', { p_token: token });
    expect(error).toBeNull();
    expect(data?.[0]?.status).toBe('cancelled');

    const row = await service.from('appointments').select('status').eq('id', id).single();
    expect(row.data?.status).toBe('cancelled');
  });

  it('el token de una cita no afecta a la de otra invitada', async () => {
    const mine = await guestAppointment(33, 10);
    const other = await guestAppointment(33, 12);

    await anonClient().rpc('cancel_guest_appointment', { p_token: mine.token });

    const otherRow = await service.from('appointments').select('status').eq('id', other.id).single();
    expect(otherRow.data?.status).toBe('confirmed');
  });

  it('un token inventado o mal formado da el mismo error genérico', async () => {
    const anon = anonClient();
    const forged = 'A'.repeat(43);
    const a = await anon.rpc('cancel_guest_appointment', { p_token: forged });
    const b = await anon.rpc('cancel_guest_appointment', { p_token: 'corto' });
    const c = await anon.rpc('get_guest_appointment', { p_token: forged });
    expect(a.error?.message).toBe('INVALID_TOKEN');
    expect(b.error?.message).toBe('INVALID_TOKEN');
    expect(c.error?.message).toBe('INVALID_TOKEN');
  });

  it('no permite cancelar con menos de 24 h de margen', async () => {
    const soon = new Date(Date.now() + 2 * 60 * 60_000);
    const created = await insertAppointment({ stylistId, serviceId, start: soon });
    const id = created.data?.id ?? '';
    const issued = await service.rpc('issue_management_token', { p_appointment_id: id });

    const { error } = await anonClient().rpc('cancel_guest_appointment', {
      p_token: issued.data ?? '',
    });
    expect(error?.message).toBe('TOO_LATE');

    const row = await service.from('appointments').select('status').eq('id', id).single();
    expect(row.data?.status).toBe('confirmed');
  });

  it('un token ya caducado (cita pasada) no funciona', async () => {
    const past = new Date(Date.now() - 3 * 24 * 60 * 60_000);
    const created = await insertAppointment({ stylistId, serviceId, start: past });
    const issued = await service.rpc('issue_management_token', {
      p_appointment_id: created.data?.id ?? '',
    });
    const { error } = await anonClient().rpc('get_guest_appointment', { p_token: issued.data ?? '' });
    expect(error?.message).toBe('INVALID_TOKEN');
  });

  it('una cita ya cancelada no se puede volver a cancelar con el token', async () => {
    const { token } = await guestAppointment(34);
    await anonClient().rpc('cancel_guest_appointment', { p_token: token });
    const again = await anonClient().rpc('cancel_guest_appointment', { p_token: token });
    expect(again.error?.message).toBe('INVALID_TOKEN');
  });

  it('anon y clientas no pueden leer los hashes ni emitir tokens', async () => {
    const { id } = await guestAppointment(35);
    const anon = anonClient();

    const read = await anon.from('appointment_tokens').select('token_hash');
    expect(read.data).toBeNull();
    expect(read.error?.code).toBe('42501');

    const issue = await anon.rpc('issue_management_token', { p_appointment_id: id });
    expect(issue.error?.code).toBe('42501');

    const clienta = await createUser('clienta-token');
    const issue2 = await clienta.client.rpc('issue_management_token', { p_appointment_id: id });
    expect(issue2.error?.code).toBe('42501');
    const read2 = await clienta.client.from('appointment_tokens').select('token_hash');
    expect(read2.error?.code).toBe('42501');
  });
});
