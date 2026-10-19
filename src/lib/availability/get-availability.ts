import { createPublicClient } from '@/lib/supabase/public-client';
import {
  AvailabilityQuerySchema,
  type AvailabilityResult,
  type AvailabilitySlot,
} from './schema';

// Huecos libres de un servicio en un día (RF-02, CA-06). El cálculo vive en la BD
// (`get_availability`, ADR-0013); aquí solo se valida la entrada y se tipa la salida.
export async function getAvailability(input: unknown): Promise<AvailabilityResult> {
  const parsed = AvailabilityQuerySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const client = createPublicClient();
  if (!client) return { ok: false, error: 'UNAVAILABLE' };

  const { serviceId, date, stylistId } = parsed.data;
  const { data, error } = await client.rpc('get_availability', {
    p_service_id: serviceId,
    p_date: date,
    ...(stylistId ? { p_stylist_id: stylistId } : {}),
  });

  if (error || !data) return { ok: false, error: 'UNAVAILABLE' };

  const slots: AvailabilitySlot[] = data.map((row) => ({
    stylistId: row.stylist_id,
    startsAt: new Date(row.starts_at).toISOString(),
  }));
  return { ok: true, slots };
}
