import type { STATUS_LABELS } from '@/lib/booking/status';
import { createPublicClient } from '@/lib/supabase/public-client';
import { TokenSchema } from './token';

// Margen mínimo para cancelar o cambiar desde el enlace (RF-05). La BD lo vuelve a comprobar.
export const CHANGE_WINDOW_MS = 24 * 60 * 60_000;

export type GuestAppointment = {
  serviceId: string;
  serviceName: string;
  priceFromCents: number | null;
  stylistId: string;
  stylistName: string;
  startsAt: string;
  status: keyof typeof STATUS_LABELS;
  canChange: boolean;
};

// Consulta con la clave anónima y la función pública de la BD. Cualquier fallo (forma incorrecta,
// desconocido, manipulado o caducado) da el MISMO resultado: no revela si la cita existe (ADR-0009).
export async function loadGuestAppointment(rawToken: string): Promise<GuestAppointment | null> {
  const token = TokenSchema.safeParse(rawToken);
  if (!token.success) return null;

  const client = createPublicClient();
  if (!client) return null;

  const { data, error } = await client.rpc('get_guest_appointment', { p_token: token.data });
  const row = data?.[0];
  if (error || !row) return null;

  const [service, stylist] = await Promise.all([
    client.from('services').select('name, price_from_cents').eq('id', row.service_id).maybeSingle(),
    client.from('stylists').select('name').eq('id', row.stylist_id).maybeSingle(),
  ]);

  return {
    serviceId: row.service_id,
    serviceName: service.data?.name ?? 'Servicio',
    priceFromCents: service.data?.price_from_cents ?? null,
    stylistId: row.stylist_id,
    stylistName: stylist.data?.name ?? 'Estilista',
    startsAt: row.starts_at,
    status: row.status,
    canChange: new Date(row.starts_at).getTime() - Date.now() >= CHANGE_WINDOW_MS,
  };
}
