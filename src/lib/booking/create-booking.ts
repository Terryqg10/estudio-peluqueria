import { getAvailability } from '@/lib/availability/get-availability';
import type { AvailabilitySlot } from '@/lib/availability/schema';
import { createServiceClient } from '@/lib/supabase/service-client';
import { CONSENT_VERSION } from './consent';
import { madridDateOf } from './dates';
import { isHoneypotTriggered } from './honeypot';
import { BookingFormSchema, toFieldErrors, type BookingResult } from './schema';

export type CreatedBooking = { ok: true; appointmentId: string };
export type BookingFailure = Exclude<BookingResult, { ok: true }>;

const MAX_ALTERNATIVES = 6;

// Huecos libres del mismo día, los más cercanos a la hora pedida (spec, sección 5).
async function alternativesFor(serviceId: string, startsAt: string): Promise<AvailabilitySlot[]> {
  const result = await getAvailability({ serviceId, date: madridDateOf(startsAt) });
  if (!result.ok) return [];
  const wanted = new Date(startsAt).getTime();
  return result.slots
    .filter((slot) => new Date(slot.startsAt).getTime() !== wanted)
    .sort((a, b) => {
      const distance =
        Math.abs(new Date(a.startsAt).getTime() - wanted) -
        Math.abs(new Date(b.startsAt).getTime() - wanted);
      // A igual distancia, primero el más temprano: orden estable y predecible.
      return distance !== 0 ? distance : new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    })
    .slice(0, MAX_ALTERNATIVES);
}

// Crea la reserva de invitada (T-005b). Orden: honeypot → Zod → función de BD (ADR-0015).
// Los errores de la BD se traducen a respuestas estables; los desconocidos no revelan detalles.
export async function createBooking(input: unknown): Promise<CreatedBooking | BookingFailure> {
  // El honeypot se mira sobre la entrada cruda y responde igual que un fallo ordinario (CA-28).
  if (isHoneypotTriggered(input)) return { ok: false, error: 'UNAVAILABLE' };

  const parsed = BookingFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = toFieldErrors(parsed.error);
    // Si los problemas no son de campos que ve la persona (ids o instante manipulados), error genérico.
    if (Object.keys(fieldErrors).length === 0) return { ok: false, error: 'UNAVAILABLE' };
    return { ok: false, error: 'INVALID_INPUT', fieldErrors };
  }

  const client = createServiceClient();
  if (!client) return { ok: false, error: 'UNAVAILABLE' };

  const data = parsed.data;
  const { data: rows, error } = await client.rpc('create_booking', {
    p_service_id: data.serviceId,
    p_stylist_id: data.stylistId,
    p_starts_at: data.startsAt,
    p_guest_name: data.name,
    p_guest_email: data.email,
    p_guest_phone: data.phone,
    p_consent_version: CONSENT_VERSION,
  });

  if (error) {
    if (error.message === 'SLOT_TAKEN') {
      return {
        ok: false,
        error: 'SLOT_TAKEN',
        alternatives: await alternativesFor(data.serviceId, data.startsAt),
      };
    }
    if (error.message === 'OUT_OF_WINDOW') return { ok: false, error: 'OUT_OF_WINDOW' };
    return { ok: false, error: 'UNAVAILABLE' };
  }

  const appointmentId = rows?.[0]?.appointment_id;
  if (!appointmentId) return { ok: false, error: 'UNAVAILABLE' };
  return { ok: true, appointmentId };
}
