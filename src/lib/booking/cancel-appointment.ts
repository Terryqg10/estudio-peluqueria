import { createPublicClient } from '@/lib/supabase/public-client';
import { TokenSchema } from './token';

export type CancelResult =
  | { ok: true }
  | { ok: false; error: 'INVALID_LINK' | 'TOO_LATE' | 'UNAVAILABLE' };

async function notifyDone(onDone: ((appointmentId: string) => Promise<unknown>) | undefined, id: string) {
  if (!onDone) return;
  try {
    await onDone(id);
  } catch {
    // El aviso nunca deshace la cancelación.
  }
}

// Cancela la cita con su token (T-006b, RF-05). La regla de las 24 h y la validez del token las
// decide la función de BD `cancel_guest_appointment` (ADR-0009); aquí solo se valida la forma y se
// traducen los errores. Un token con mala forma y uno desconocido dan la MISMA respuesta.
// Nunca lanza: cualquier fallo inesperado es `UNAVAILABLE`, sin detalles.
// `onDone` se llama con el id de la cita DESPUÉS de que la BD confirme la cancelación (T-006d: el aviso
// por email). El id no sale al cliente. Un fallo de `onDone` no cambia el resultado.
export async function cancelAppointment(
  input: unknown,
  onDone?: (appointmentId: string) => Promise<unknown>,
): Promise<CancelResult> {
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
    const row = data?.[0];
    if (row?.status !== 'cancelled') return { ok: false, error: 'UNAVAILABLE' };
    await notifyDone(onDone, row.id);
    return { ok: true };
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}
