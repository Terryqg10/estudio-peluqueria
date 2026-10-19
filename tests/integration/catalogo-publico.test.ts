import { describe, expect, it } from 'vitest';
import { anonClient } from './helpers/db';

// T-003: la home lee el catálogo con la clave anónima. Este test usa la semilla de T-002
// (`supabase db reset`): comprueba que el anónimo ve el catálogo activo, ordenado.
describe('catalogo-publico (RF-01)', () => {
  it('el anónimo lee los servicios activos ordenados por sort_order', async () => {
    const { data, error } = await anonClient()
      .from('services')
      .select('name, category, price_from_cents, duration_min, sort_order')
      .order('sort_order', { ascending: true });

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThanOrEqual(8);
    const orders = (data ?? []).map((s) => s.sort_order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(data?.map((s) => s.name)).toContain('Corte mujer');
  });

  it('cada servicio tiene precio «desde» y duración positivos', async () => {
    const { data } = await anonClient().from('services').select('price_from_cents, duration_min');
    for (const s of data ?? []) {
      expect(s.price_from_cents).toBeGreaterThanOrEqual(0);
      expect(s.duration_min).toBeGreaterThan(0);
    }
  });
});
