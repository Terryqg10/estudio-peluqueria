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
  type TestUser,
} from './helpers/db';

// CA-12 (RF-04, RNF-03): una clienta solo ve sus citas; la consulta directa a las
// de otra devuelve vacío. Los clientes no escriben citas directamente (ADR-0009).
describe('aislamiento-clientas (CA-12)', () => {
  let clientA: TestUser;
  let clientB: TestUser;
  let appointmentA: string;
  let appointmentB: string;

  beforeAll(async () => {
    const stylistId = await createStylist();
    const serviceId = await createService(60);
    clientA = await createUser('clienta-a');
    clientB = await createUser('clienta-b');

    const a = await insertAppointment({
      stylistId,
      serviceId,
      start: daysFromNow(20, 10),
      userId: clientA.id,
    });
    const b = await insertAppointment({
      stylistId,
      serviceId,
      start: daysFromNow(20, 12),
      userId: clientB.id,
    });
    appointmentA = a.data?.id ?? '';
    appointmentB = b.data?.id ?? '';
    expect(appointmentA).not.toBe('');
    expect(appointmentB).not.toBe('');
  });

  afterAll(cleanup);

  it('la clienta A ve solo su cita', async () => {
    const { data, error } = await clientA.client.from('appointments').select('id, user_id');
    expect(error).toBeNull();
    expect(data?.map((r) => r.id)).toEqual([appointmentA]);
  });

  it('la clienta A no ve la cita de B ni consultándola por id', async () => {
    const { data, error } = await clientA.client
      .from('appointments')
      .select('id')
      .eq('id', appointmentB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('la clienta B ve solo la suya (simetría)', async () => {
    const { data } = await clientB.client.from('appointments').select('id');
    expect(data?.map((r) => r.id)).toEqual([appointmentB]);
  });

  it('la clienta A no puede modificar ni borrar la cita de B', async () => {
    const upd = await clientA.client
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointmentB)
      .select('id');
    expect(upd.data ?? []).toEqual([]);

    const del = await clientA.client.from('appointments').delete().eq('id', appointmentB).select('id');
    expect(del.data ?? []).toEqual([]);

    const { data } = await service.from('appointments').select('status').eq('id', appointmentB).single();
    expect(data?.status).toBe('confirmed');
  });

  it('una clienta no puede modificar ni siquiera su propia cita directamente', async () => {
    const upd = await clientA.client
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointmentA)
      .select('id');
    expect(upd.data ?? []).toEqual([]);

    const { data } = await service.from('appointments').select('status').eq('id', appointmentA).single();
    expect(data?.status).toBe('confirmed');
  });

  it('una clienta no puede insertar citas directamente', async () => {
    const stylistId = await createStylist();
    const serviceId = await createService(30);
    const { error } = await clientA.client.from('appointments').insert({
      stylist_id: stylistId,
      service_id: serviceId,
      during: '[2031-01-01T10:00:00Z,2031-01-01T10:30:00Z)',
      user_id: clientA.id,
    });
    expect(error).not.toBeNull();
  });

  it('una clienta lee su perfil pero no el de otra', async () => {
    const own = await clientA.client.from('profiles').select('id').eq('id', clientA.id);
    expect(own.data).toHaveLength(1);

    const other = await clientA.client.from('profiles').select('id').eq('id', clientB.id);
    expect(other.data).toEqual([]);
  });

  it('el anónimo no puede leer citas (permiso denegado)', async () => {
    const { data, error } = await anonClient().from('appointments').select('id');
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
  });
});
