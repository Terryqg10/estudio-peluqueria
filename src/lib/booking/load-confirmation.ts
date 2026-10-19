import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service-client';
import { parseRange } from './range';

// Lo que muestra la confirmación: SOLO servicio, estilista y hora. Nunca nombre, email ni teléfono.
export type Confirmation = {
  serviceName: string;
  stylistName: string;
  priceFromCents: number;
  startsAt: string;
  endsAt: string;
};

const IdSchema = z.string().uuid();

// El id viene de una cookie httpOnly (entrada externa): se valida antes de consultar.
export async function loadConfirmation(rawId: string | undefined): Promise<Confirmation | null> {
  const parsed = IdSchema.safeParse(rawId);
  if (!parsed.success) return null;

  const client = createServiceClient();
  if (!client) return null;

  const { data, error } = await client
    .from('appointments')
    .select('during, status, services(name, price_from_cents), stylists(name)')
    .eq('id', parsed.data)
    .maybeSingle();

  if (error || !data || data.status === 'cancelled') return null;
  const range = parseRange(data.during);
  if (!range || !data.services || !data.stylists) return null;

  return {
    serviceName: data.services.name,
    stylistName: data.stylists.name,
    priceFromCents: data.services.price_from_cents,
    startsAt: range.start,
    endsAt: range.end,
  };
}
