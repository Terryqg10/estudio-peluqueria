import { createPublicClient } from '@/lib/supabase/public-client';
import type { BookingData } from './types';

// Servicios, estilistas y qué hace cada una, con la clave anónima (RLS: solo lo activo y público).
export async function loadBookingData(): Promise<BookingData | null> {
  const client = createPublicClient();
  if (!client) return null;

  const [services, stylists, offers] = await Promise.all([
    client
      .from('services')
      .select('id, name, category, price_from_cents, duration_min, sort_order')
      .order('sort_order', { ascending: true }),
    client.from('stylists').select('id, name, specialty').order('name', { ascending: true }),
    client.from('stylist_services').select('stylist_id, service_id'),
  ]);

  if (services.error || stylists.error || offers.error) return null;
  if (!services.data || !stylists.data || !offers.data) return null;

  const activeStylists = new Set(stylists.data.map((s) => s.id));
  const offerMap: Record<string, string[]> = {};
  for (const row of offers.data) {
    if (!activeStylists.has(row.stylist_id)) continue;
    (offerMap[row.service_id] ??= []).push(row.stylist_id);
  }

  return {
    services: services.data.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      priceFromCents: s.price_from_cents,
      durationMin: s.duration_min,
    })),
    stylists: stylists.data.map((s) => ({ id: s.id, name: s.name, specialty: s.specialty })),
    offers: offerMap,
  };
}
