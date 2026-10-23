import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, cleanup, createAdmin, createService, createStylist, createUser, service, type TestUser } from './helpers/db';

// gallery_items (T-011, RF-01, CA-02): lectura pública solo de los trabajos activos; gestión solo del Admin.
describe('galería: gallery_items', () => {
  let admin: TestUser;
  let clienta: TestUser;
  let serviceId = '';
  let stylistId = '';
  const created: string[] = [];

  const row = (overrides: Record<string, unknown> = {}) => ({
    technique: 'Prueba',
    service_id: serviceId,
    stylist_id: stylistId,
    before_path: '/images/galeria/prueba-antes.jpg',
    after_path: '/images/galeria/prueba-despues.jpg',
    alt_before: 'Antes de prueba',
    alt_after: 'Después de prueba',
    ...overrides,
  });

  beforeAll(async () => {
    admin = await createAdmin();
    clienta = await createUser('clienta');
    serviceId = await createService(60);
    stylistId = await createStylist('Estilista de galería');
  });

  afterAll(async () => {
    if (created.length > 0) await service.from('gallery_items').delete().in('id', created);
    await cleanup();
  });

  it('la semilla deja trabajos públicos de varias técnicas, con imágenes provisionales bajo /images/galeria/', async () => {
    const { data, error } = await anonClient().from('gallery_items').select('technique, before_path, after_path, ai_generated');
    expect(error).toBeNull();
    expect(new Set((data ?? []).map((r) => r.technique)).size).toBeGreaterThanOrEqual(3);
    for (const r of data ?? []) {
      expect(r.before_path.startsWith('/images/galeria/')).toBe(true);
      expect(r.after_path.startsWith('/images/galeria/')).toBe(true);
      expect(r.ai_generated).toBe(false); // provisionales (no IA) hasta que se sustituyan
    }
  });

  it('el Admin crea trabajos; el público solo ve los activos', async () => {
    const active = await admin.client.from('gallery_items').insert(row({ technique: 'Activo' })).select('id').single();
    const inactive = await admin.client.from('gallery_items').insert(row({ technique: 'Inactivo', active: false })).select('id').single();
    expect(active.error).toBeNull();
    expect(inactive.error).toBeNull();
    created.push(active.data?.id ?? '', inactive.data?.id ?? '');

    const publicView = await anonClient().from('gallery_items').select('id').in('id', created);
    expect((publicView.data ?? []).map((r) => r.id)).toEqual([active.data?.id]);

    const adminView = await admin.client.from('gallery_items').select('id').in('id', created);
    expect(adminView.data).toHaveLength(2);
  });

  it('una clienta y un anónimo no pueden crear, cambiar ni borrar trabajos', async () => {
    for (const client of [clienta.client, anonClient()]) {
      const insert = await client.from('gallery_items').insert(row({ technique: 'Intruso' }));
      expect(insert.error).not.toBeNull();
    }
    const id = created[0] ?? '';
    const update = await clienta.client.from('gallery_items').update({ technique: 'Cambiada' }).eq('id', id).select('id');
    expect(update.data ?? []).toEqual([]);
    const del = await clienta.client.from('gallery_items').delete().eq('id', id).select('id');
    expect(del.data ?? []).toEqual([]);

    const stored = await service.from('gallery_items').select('technique').eq('id', id).single();
    expect(stored.data?.technique).toBe('Activo');
    expect((await service.from('gallery_items').select('id').eq('technique', 'Intruso')).data).toEqual([]);
  });

  it('rechaza rutas de imagen fuera de /images/galeria/ y textos alternativos vacíos', async () => {
    const bad: Record<string, unknown>[] = [
      { before_path: 'https://ejemplo.com/foto.jpg' },
      { after_path: '/images/otra/foto.jpg' },
      { before_path: '/images/galeria/../secreto.jpg' },
      { after_path: '/images/galeria/Mayusculas.jpg' },
      { alt_before: 'ab' },
      { alt_after: '' },
      { technique: 'x' },
    ];
    for (const override of bad) {
      const { error } = await admin.client.from('gallery_items').insert(row(override));
      expect(error, JSON.stringify(override)).not.toBeNull();
    }
  });

  it('un trabajo cuyo servicio se desactiva sigue en la tabla; al borrar el servicio se borra el trabajo', async () => {
    const id = created[0] ?? '';
    await service.from('services').update({ active: false }).eq('id', serviceId);
    expect((await service.from('gallery_items').select('id').eq('id', id)).data).toHaveLength(1);
    // La función de la web no lo muestra: el servicio inactivo no es público (RLS de services).
    const embedded = await anonClient().from('gallery_items').select('id, services(id)').eq('id', id).single();
    expect(embedded.data?.services ?? null).toBeNull();

    await service.from('services').delete().eq('id', serviceId);
    expect((await service.from('gallery_items').select('id').eq('id', id)).data).toEqual([]);
  });
});
