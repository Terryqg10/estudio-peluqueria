import { createPublicClient } from '@/lib/supabase/public-client';
import { TokenSchema } from './token';

export type CancelResult =
  | { ok: true }
  | { ok: false; error: 'INVALID_LINK' | 'TOO_LATE' | 'UNAVAILABLE' };

// Cancela la cita con su token (T-006b, RF-05). La regla de las 24 h y la validez del token las
// decide la función de BD `cancel_guest_appointment` (ADR-0009); aquí solo se valida la forma y se
// traducen los errores. Un token con mala forma y uno desconocido dan la MISMA respuesta.
// Nunca lanza: cualquier fallo inesperado es `UNAVAILABLE`, sin detalles.
export async function cancelAppointment(input: unknown): Promise<CancelResult> {
  const token = TokenSchema.safeParse(input);
  if (!token.success) return { ok: false, error: 'INVALID_LINK' };

  try {
    const client = createPublicClient();
    if (!client) return { ok: false, error: 'UNAVAILABLE' };

    const { data, error } = await client.rpc('cancel_guest_appointment', { p_token: token.data });
    if (error) {
      if (error.message === 'INVALID_TOKEN') return { ok: false, error: 'INVALID_LINK' };
      if (error.message === 'TOO_LATE') return { ok: false, error: 'TOO_LATE' };
      return { ok: false, error: 'UNAVAILABLE' };
    }
    return data?.[0]?.status === 'cancelled' ? { ok: true } : { ok: false, error: 'UNAVAILABLE' };
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}
