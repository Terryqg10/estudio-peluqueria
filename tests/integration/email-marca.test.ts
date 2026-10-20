import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanup,
  createService,
  createStylist,
  createUser,
  daysFromNow,
  insertAppointment,
  offerService,
  service,
  setSchedule,
  anonClient,
  type TestUser,
} from './helpers/db';

// ADR-0018: `confirmation_email_sent_at` (nula = no enviado) solo la escribe service_role.
describe('email-marca: confirmation_email_sent_at', () => {
  let appointmentId: string;
  let clienta: TestUser;

  beforeAll(async () => {
    const stylistId = await createStylist();
    const serviceId = await createService(30);
    await offerService(stylistId, serviceId);
    await setSchedule(stylistId, 1, '10:00', '14:00');
    clienta = await createUser('clienta-email');
    const created = await insertAppointment({
      stylistId,
      serviceId,
      start: daysFromNow(35, 10),
      userId: clienta.id,
    });
    appointmentId = created.data?.id ?? '';
    expect(appointmentId).not.toBe('');
  });

  afterAll(cleanup);

  const sentAt = async () => {
    const { data } = await service
      .from('appointments')
      .select('confirmation_email_sent_at')
      .eq('id', appointmentId)
      .single();
    return data?.confirmation_email_sent_at ?? null;
  };

  it('una cita nueva nace sin marca de envío', async () => {
    expect(await sentAt()).toBeNull();
  });

  it('la clienta dueña de la cita no puede escribir la marca (sin UPDATE) y sigue nula', async () => {
    const upd = await clienta.client
      .from('appointments')
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq('id', appointmentId)
      .select('id');
    expect(upd.data ?? []).toEqual([]);
    expect(await sentAt()).toBeNull();
  });

  it('el anónimo no puede leer ni escribir la marca', async () => {
    const anon = anonClient();
    const read = await anon.from('appointments').select('confirmation_email_sent_at');
    expect(read.error?.code).toBe('42501');
    const write = await anon
      .from('appointments')
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq('id', appointmentId);
    expect(write.error?.code).toBe('42501');
    expect(await sentAt()).toBeNull();
  });

  it('service_role sí puede marcarla', async () => {
    const stamp = new Date().toISOString();
    const upd = await service
      .from('appointments')
      .update({ confirmation_email_sent_at: stamp })
      .eq('id', appointmentId);
    expect(upd.error).toBeNull();
    expect(new Date((await sentAt()) ?? 0).getTime()).toBe(new Date(stamp).getTime());
  });
});
