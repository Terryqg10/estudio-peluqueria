import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  cleanup,
  createAdmin,
  createService,
  createStylist,
  createUser,
  offerService,
  type TestUser,
} from './helpers/db';

// ADR-0014: lectura pública de qué estilistas hacen cada servicio; escritura solo Admin.
describe('stylist_services (ADR-0014)', () => {
  let stylistId: string;
  let serviceId: string;
  let admin: TestUser;
  let clienta: TestUser;

  beforeAll(async () => {
    stylistId = await createStylist();
    serviceId = await createService(30);
    await offerService(stylistId, serviceId);
    admin = await createAdmin();
    clienta = await createUser('clienta');
  });

  afterAll(cleanup);

  it('el anónimo puede leer qué estilistas hacen un servicio', async () => {
    const { data, error } = await anonClient()
      .from('stylist_services')
      .select('stylist_id')
      .eq('service_id', serviceId);
    expect(error).toBeNull();
    expect(data?.map((r) => r.stylist_id)).toEqual([stylistId]);
  });

  it('el anónimo y la clienta no pueden escribir', async () => {
    const other = await createService(45);
    const anon = await anonClient()
      .from('stylist_services')
      .insert({ stylist_id: stylistId, service_id: other });
    expect(anon.error).not.toBeNull();

    const cl = await clienta.client
      .from('stylist_services')
      .insert({ stylist_id: stylistId, service_id: other });
    expect(cl.error).not.toBeNull();

    const del = await clienta.client
      .from('stylist_services')
      .delete()
      .eq('service_id', serviceId)
      .select();
    expect(del.data ?? []).toEqual([]);
  });

  it('el Admin puede asignar y quitar servicios', async () => {
    const other = await createService(45);
    const ins = await admin.client
      .from('stylist_services')
      .insert({ stylist_id: stylistId, service_id: other });
    expect(ins.error).toBeNull();

    const del = await admin.client
      .from('stylist_services')
      .delete()
      .eq('service_id', other)
      .select();
    expect(del.data).toHaveLength(1);
  });

  it('una asignación duplicada se rechaza', async () => {
    const dup = await admin.client
      .from('stylist_services')
      .insert({ stylist_id: stylistId, service_id: serviceId });
    expect(dup.error?.code).toBe('23505');
  });
});
