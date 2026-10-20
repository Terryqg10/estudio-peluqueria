import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  cleanup,
  createService,
  createStylist,
  insertAppointment,
  service,
} from './helpers/db';

// CA-14 (parte cancelar, T-006b): la ventana de 24 h se aplica en la BD, no en la interfaz.
describe('ventana-24h (RF-05, CA-13, CA-14)', () => {
  let stylistId: string;
  let serviceId: string;

  beforeAll(async () => {
    stylistId = await createStylist();
    serviceId = await createService(60);
  });

  afterAll(cleanup);

  async function appointmentIn(hours: number) {
    const start = new Date(Date.now() + hours * 60 * 60_000);
    start.setUTCSeconds(0, 0);
    const created = await insertAppointment({ stylistId, serviceId, start });
    const id = created.data?.id ?? '';
    const issued = await service.rpc('issue_management_token', { p_appointment_id: id });
    return { id, token: issued.data ?? '', start };
  }

  async function statusOf(id: string) {
    const { data } = await service.from('appointments').select('status').eq('id', id).single();
    return data?.status;
  }

  it('CA-14: a 23 h se rechaza con TOO_LATE y la cita sigue confirmada', async () => {
    const { id, token } = await appointmentIn(23);
    const { error } = await anonClient().rpc('cancel_guest_appointment', { p_token: token });
    expect(error?.message).toBe('TOO_LATE');
    expect(await statusOf(id)).toBe('confirmed');
  });

  it('CA-13: a 25 h se cancela y el hueco vuelve a estar libre', async () => {
    const { id, token, start } = await appointmentIn(25);
    const { data, error } = await anonClient().rpc('cancel_guest_appointment', { p_token: token });
    expect(error).toBeNull();
    expect(data?.[0]?.status).toBe('cancelled');
    expect(await statusOf(id)).toBe('cancelled');

    // Hueco libre: otra cita puede ocupar exactamente el mismo hueco (la exclusión anti-solape,
    // CA-09, ya no lo bloquea).
    const again = await insertAppointment({ stylistId, serviceId, start });
    expect(again.error).toBeNull();
  });

  it('CA-14: un token falso recibe el error genérico, no TOO_LATE (no delata nada)', async () => {
    const { error } = await anonClient().rpc('cancel_guest_appointment', { p_token: 'A'.repeat(43) });
    expect(error?.message).toBe('INVALID_TOKEN');
  });
});
