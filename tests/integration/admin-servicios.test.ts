import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  cleanup,
  createAdmin,
  createStylist,
  createUser,
  daysFromNow,
  insertAppointment,
  service,
  type TestUser,
} from './helpers/db';

// admin_save_service (T-009a, RF-07, CA-18): crear y editar servicios y sus estilistas, solo el Admin.
describe('admin-servicios: admin_save_service', () => {
  let admin: TestUser;
  let clienta: TestUser;
  let stylistA = '';
  let stylistB = '';
  const unique = `Servicio ${Date.now()}`;
  const created: string[] = [];

  beforeAll(async () => {
    admin = await createAdmin();
    clienta = await createUser('clienta');
    stylistA = await createStylist('Estilista A');
    stylistB = await createStylist('Estilista B');
  });

  afterAll(async () => {
    try {
      if (created.length > 0) {
        // Las citas hechas con estos servicios (`on delete restrict`) hay que borrarlas antes; si no, el servicio queda
        // como resto de la prueba (T-022). Un fallo se avisa, pero la limpieza general se ejecuta siempre.
        await service.from('appointments').delete().in('service_id', created);
        const removed = await service.from('services').delete().in('id', created);
        if (removed.error) throw new Error(`afterAll: no se pudieron borrar los servicios creados: ${removed.error.message}`);
      }
    } finally {
      await cleanup();
    }
  });

  const save = (overrides: Partial<Record<string, unknown>> = {}) =>
    admin.client.rpc('admin_save_service', {
      p_category: 'Pruebas',
      p_name: unique,
      p_price_from_cents: 4500,
      p_duration_min: 60,
      p_active: true,
      p_stylist_ids: [stylistA],
      ...overrides,
    });

  async function offeredBy(serviceId: string): Promise<string[]> {
    const { data } = await service.from('stylist_services').select('stylist_id').eq('service_id', serviceId);
    return (data ?? []).map((r) => r.stylist_id).sort();
  }

  it('una clienta y un anónimo no pueden ejecutarla', async () => {
    const args = {
      p_category: 'Intrusa',
      p_name: 'Servicio intruso',
      p_price_from_cents: 100,
      p_duration_min: 30,
      p_active: true,
      p_stylist_ids: [],
    };
    const asClient = await clienta.client.rpc('admin_save_service', args);
    expect(asClient.error?.message).toBe('FORBIDDEN');
    const asAnon = await anonClient().rpc('admin_save_service', args);
    expect(asAnon.error).not.toBeNull();

    const { data } = await service.from('services').select('id').eq('name', 'Servicio intruso');
    expect(data).toEqual([]);
  });

  it('el Admin crea un servicio al final de la lista con sus estilistas', async () => {
    const before = await service.from('services').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const { data, error } = await save({ p_stylist_ids: [stylistA, stylistB] });
    expect(error).toBeNull();
    const id = String(data);
    created.push(id);

    const row = await service.from('services').select('*').eq('id', id).single();
    expect(row.data).toMatchObject({
      category: 'Pruebas',
      name: unique,
      price_from_cents: 4500,
      duration_min: 60,
      active: true,
    });
    expect(row.data?.sort_order).toBe((before.data?.[0]?.sort_order ?? 0) + 1);
    expect(await offeredBy(id)).toEqual([stylistA, stylistB].sort());
  });

  it('edita el servicio y reemplaza sus estilistas', async () => {
    const id = created[0] ?? '';
    const { error } = await save({
      p_id: id,
      p_name: `${unique} editado`,
      p_price_from_cents: 5050,
      p_duration_min: 90,
      p_stylist_ids: [stylistB],
    });
    expect(error).toBeNull();

    const row = await service.from('services').select('name, price_from_cents, duration_min').eq('id', id).single();
    expect(row.data).toEqual({ name: `${unique} editado`, price_from_cents: 5050, duration_min: 90 });
    expect(await offeredBy(id)).toEqual([stylistB]);
  });

  it('desactivar lo oculta al público y conserva las citas futuras', async () => {
    const id = created[0] ?? '';
    const appt = await insertAppointment({ stylistId: stylistB, serviceId: id, start: daysFromNow(27, 10) });
    expect(appt.error).toBeNull();

    expect((await save({ p_id: id, p_name: `${unique} editado`, p_active: false, p_stylist_ids: [stylistB] })).error).toBeNull();

    const publicRows = await anonClient().from('services').select('id').eq('id', id);
    expect(publicRows.data).toEqual([]);
    const kept = await service.from('appointments').select('status').eq('id', appt.data?.id ?? '').single();
    expect(kept.data?.status).toBe('confirmed');

    // Y se puede volver a activar.
    expect((await save({ p_id: id, p_name: `${unique} editado`, p_active: true, p_stylist_ids: [stylistB] })).error).toBeNull();
    const again = await anonClient().from('services').select('id').eq('id', id);
    expect(again.data).toHaveLength(1);
  });

  it('rechaza datos no válidos sin crear nada', async () => {
    const invalid: Record<string, unknown>[] = [
      { p_name: 'A' },
      { p_name: 'x'.repeat(81) },
      { p_category: ' ' },
      { p_price_from_cents: -1 },
      { p_price_from_cents: 1_000_000 },
      { p_duration_min: 0 },
      { p_duration_min: 62 },
      { p_duration_min: 485 },
    ];
    for (const override of invalid) {
      const { error } = await save({ p_name: `${unique} inválido`, ...override });
      expect(error?.message, JSON.stringify(override)).toBe('INVALID_INPUT');
    }
    const { data } = await service.from('services').select('id').eq('name', `${unique} inválido`);
    expect(data).toEqual([]);
  });

  it('un nombre repetido (sin distinguir mayúsculas) da DUPLICATE_NAME; el mismo servicio puede conservar el suyo', async () => {
    const dup = await save({ p_name: `${unique} EDITADO` });
    expect(dup.error?.message).toBe('DUPLICATE_NAME');

    const keep = await save({ p_id: created[0] ?? '', p_name: `${unique} editado`, p_stylist_ids: [stylistB] });
    expect(keep.error).toBeNull();
  });

  it('es atómica: una estilista inexistente no deja ni el servicio ni asignaciones a medias', async () => {
    const name = `${unique} atómica`;
    const { error } = await save({
      p_name: name,
      p_stylist_ids: [stylistA, '00000000-0000-0000-0000-000000000000'],
    });
    expect(error?.message).toBe('INVALID_INPUT');
    const { data } = await service.from('services').select('id').eq('name', name);
    expect(data).toEqual([]);

    // Al editar con un error tampoco cambia nada.
    const id = created[0] ?? '';
    const bad = await save({ p_id: id, p_name: `${unique} editado`, p_stylist_ids: ['00000000-0000-0000-0000-000000000000'] });
    expect(bad.error?.message).toBe('INVALID_INPUT');
    expect(await offeredBy(id)).toEqual([stylistB]);
  });

  it('NOT_FOUND al editar un servicio que no existe', async () => {
    const { error } = await save({ p_id: '00000000-0000-0000-0000-000000000000', p_name: `${unique} fantasma` });
    expect(error?.message).toBe('NOT_FOUND');
  });
});
