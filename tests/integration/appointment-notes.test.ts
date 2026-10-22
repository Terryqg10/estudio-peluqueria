import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  cleanup,
  createAdmin,
  createService,
  createStylist,
  createUser,
  daysFromNow,
  insertAppointment,
  service,
  type TestUser,
} from './helpers/db';

// Notas internas de la cita (ADR-0027, T-008d): solo las lee y escribe el Admin; se borran con la cita.
describe('appointment_notes: aislamiento', () => {
  let admin: TestUser;
  let clienta: TestUser;
  let appointmentId = '';

  beforeAll(async () => {
    const stylistId = await createStylist();
    const serviceId = await createService(60);
    admin = await createAdmin();
    clienta = await createUser('clienta');
    // Cita de la propia clienta: lee la cita, pero no su nota.
    const created = await insertAppointment({
      stylistId,
      serviceId,
      start: daysFromNow(26, 10),
      userId: clienta.id,
    });
    appointmentId = created.data?.id ?? '';
    expect(appointmentId).not.toBe('');
  });

  afterAll(cleanup);

  it('el Admin crea, lee, actualiza y borra la nota', async () => {
    const insert = await admin.client
      .from('appointment_notes')
      .upsert({ appointment_id: appointmentId, note: 'Alergia al amoníaco' }, { onConflict: 'appointment_id' });
    expect(insert.error).toBeNull();

    const read = await admin.client.from('appointment_notes').select('note').eq('appointment_id', appointmentId);
    expect(read.data).toEqual([{ note: 'Alergia al amoníaco' }]);

    const update = await admin.client
      .from('appointment_notes')
      .upsert({ appointment_id: appointmentId, note: 'Sin amoníaco' }, { onConflict: 'appointment_id' });
    expect(update.error).toBeNull();

    const del = await admin.client.from('appointment_notes').delete().eq('appointment_id', appointmentId);
    expect(del.error).toBeNull();
    const after = await admin.client.from('appointment_notes').select('note').eq('appointment_id', appointmentId);
    expect(after.data).toEqual([]);
  });

  it('rechaza una nota vacía o de más de 500 caracteres', async () => {
    for (const note of ['', 'x'.repeat(501)]) {
      const result = await admin.client.from('appointment_notes').insert({ appointment_id: appointmentId, note });
      expect(result.error).not.toBeNull();
    }
  });

  it('la clienta dueña de la cita no lee ni escribe la nota; un anónimo tampoco', async () => {
    await service.from('appointment_notes').upsert({ appointment_id: appointmentId, note: 'Interna' });

    // La clienta sí lee su cita…
    const own = await clienta.client.from('appointments').select('id').eq('id', appointmentId);
    expect(own.data).toHaveLength(1);

    // …pero no la nota.
    const read = await clienta.client.from('appointment_notes').select('note');
    expect(read.data ?? []).toEqual([]);

    const write = await clienta.client
      .from('appointment_notes')
      .upsert({ appointment_id: appointmentId, note: 'Cambiada por la clienta' }, { onConflict: 'appointment_id' });
    expect(write.error).not.toBeNull();
    const del = await clienta.client
      .from('appointment_notes')
      .delete()
      .eq('appointment_id', appointmentId)
      .select('note');
    expect(del.data ?? []).toEqual([]);

    const anon = await anonClient().from('appointment_notes').select('note');
    expect(anon.error).not.toBeNull();

    const stored = await service.from('appointment_notes').select('note').eq('appointment_id', appointmentId);
    expect(stored.data).toEqual([{ note: 'Interna' }]);
  });

  it('la nota se borra con la cita', async () => {
    await service.from('appointments').delete().eq('id', appointmentId);
    const left = await service.from('appointment_notes').select('note').eq('appointment_id', appointmentId);
    expect(left.data).toEqual([]);
  });
});
