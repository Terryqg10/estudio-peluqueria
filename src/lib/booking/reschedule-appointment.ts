import { z } from 'zod';
import { AvailabilityQuerySchema, type AvailabilitySlot } from '@/lib/availability/schema';
import { createPublicClient } from '@/lib/supabase/public-client';
import { TokenSchema } from './token';

// Entradas externas del cambio de cita (RNF-02): se validan en el límite.
export const RescheduleInputSchema = z.object({
  token: TokenSchema,
  stylistId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
});

export const RescheduleAvailabilityInputSchema = z.object({
  token: TokenSchema,
  date: AvailabilityQuerySchema.shape.date,
});

export type RescheduleError =
  | 'INVALID_LINK'
  | 'INVALID_INPUT'
  | 'TOO_LATE'
  | 'SLOT_TAKEN'
  | 'OUT_OF_WINDOW'
  | 'NO_CHANGE'
  | 'UNAVAILABLE';

export type RescheduleResult = { ok: true } | { ok: false; error: RescheduleError };

export type RescheduleAvailabilityResult =
  | { ok: true; slots: AvailabilitySlot[] }
  | { ok: false; error: 'INVALID_LINK' | 'INVALID_INPUT' | 'TOO_LATE' | 'UNAVAILABLE' };

// Mensajes de la BD que se traducen a respuestas estables; el resto no revela detalles.
const KNOWN: Record<string, RescheduleError> = {
  INVALID_TOKEN: 'INVALID_LINK',
  TOO_LATE: 'TOO_LATE',
  SLOT_TAKEN: 'SLOT_TAKEN',
  OUT_OF_WINDOW: 'OUT_OF_WINDOW',
  NO_CHANGE: 'NO_CHANGE',
  INVALID_SELECTION: 'INVALID_INPUT',
  INVALID_INPUT: 'INVALID_INPUT',
};

// Con el token mal formado se responde igual que con uno desconocido (no delata nada).
function invalidInputError(input: unknown): 'INVALID_LINK' | 'INVALID_INPUT' {
  const token = typeof input === 'object' && input !== null && 'token' in input ? input.token : undefined;
  return TokenSchema.safeParse(token).success ? 'INVALID_INPUT' : 'INVALID_LINK';
}

// Cambia la cita del token a otro hueco (T-006c, RF-05). La regla de las 24 h, la validez del
// token, el horario y la carrera por el hueco los decide `reschedule_guest_appointment` (ADR-0019).
// Nunca lanza. `onDone` se llama con el id de la cita DESPUÉS de que la BD confirme el cambio (T-006d: el
// aviso por email). El id no sale al cliente. Un fallo de `onDone` no cambia el resultado.
export async function rescheduleAppointment(
  input: unknown,
  onDone?: (appointmentId: string) => Promise<unknown>,
): Promise<RescheduleResult> {
  const parsed = RescheduleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: invalidInputError(input) };

  try {
    const client = createPublicClient();
    if (!client) return { ok: false, error: 'UNAVAILABLE' };

    const { data, error } = await client.rpc('reschedule_guest_appointment', {
      p_token: parsed.data.token,
      p_stylist_id: parsed.data.stylistId,
      p_starts_at: parsed.data.startsAt,
    });
    if (error) return { ok: false, error: KNOWN[error.message] ?? 'UNAVAILABLE' };
    const id = data?.[0]?.id;
    if (!id) return { ok: false, error: 'UNAVAILABLE' };
    if (onDone) {
      try {
        await onDone(id);
      } catch {
        // El aviso nunca deshace el cambio.
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}

// Huecos libres para mover la cita del token (sin contar la propia cita).
export async function loadRescheduleAvailability(input: unknown): Promise<RescheduleAvailabilityResult> {
  const parsed = RescheduleAvailabilityInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: invalidInputError(input) };

  try {
    const client = createPublicClient();
    if (!client) return { ok: false, error: 'UNAVAILABLE' };

    const { data, error } = await client.rpc('get_guest_reschedule_availability', {
      p_token: parsed.data.token,
      p_date: parsed.data.date,
    });
    if (error) {
      if (error.message === 'INVALID_TOKEN') return { ok: false, error: 'INVALID_LINK' };
      if (error.message === 'TOO_LATE') return { ok: false, error: 'TOO_LATE' };
      return { ok: false, error: 'UNAVAILABLE' };
    }
    if (!data) return { ok: false, error: 'UNAVAILABLE' };
    return {
      ok: true,
      slots: data.map((row) => ({
        stylistId: row.stylist_id,
        startsAt: new Date(row.starts_at).toISOString(),
      })),
    };
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}
