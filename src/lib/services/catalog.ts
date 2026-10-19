import type { Database } from '@/lib/database.types';
import { createPublicClient } from '@/lib/supabase/public-client';

export type ServiceRow = Pick<
  Database['public']['Tables']['services']['Row'],
  'id' | 'category' | 'name' | 'price_from_cents' | 'duration_min' | 'sort_order'
>;

export type ServiceGroup = { category: string; services: ServiceRow[] };

export type CatalogResult = { ok: true; groups: ServiceGroup[] } | { ok: false };

// Agrupa por categoría respetando el orden de aparición (la BD ya ordena por sort_order).
export function groupServices(rows: readonly ServiceRow[]): ServiceGroup[] {
  const groups: ServiceGroup[] = [];
  for (const row of rows) {
    const existing = groups.find((g) => g.category === row.category);
    if (existing) existing.services.push(row);
    else groups.push({ category: row.category, services: [row] });
  }
  return groups;
}

const wholeEuros = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const withCents = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

// Euros enteros sin decimales («25 €»); con céntimos, siempre dos («25,50 €»).
export function formatPriceFrom(cents: number): string {
  const format = cents % 100 === 0 ? wholeEuros : withCents;
  return `Desde ${format.format(cents / 100)}`;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

export async function getServiceCatalog(): Promise<CatalogResult> {
  const client = createPublicClient();
  if (!client) return { ok: false };

  const { data, error } = await client
    .from('services')
    .select('id, category, name, price_from_cents, duration_min, sort_order')
    .order('sort_order', { ascending: true });

  if (error || !data) return { ok: false };
  return { ok: true, groups: groupServices(data) };
}
