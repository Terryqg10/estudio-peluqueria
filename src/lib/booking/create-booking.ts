import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getAvailability } from '@/lib/availability/get-availability';
import type { AvailabilitySlot } from '@/lib/availability/schema';
import { createServiceClient } from '@/lib/supabase/service-client';
import { CONSENT_VERSION } from './consent';
import { BOOKING_LIMITS } from './limits';
import { madridDateOf } from './dates';
import { isHoneypotTriggered } from './honeypot';
import { BookingFormSchema, toFieldErrors, type BookingResult } from './schema';

export type CreatedBooking = { ok: true; appointmentId: string };
export type BookingFailure = Exclude<BookingResult, { ok: true }>;

const MAX_ALTERNATIVES = 6;

// Guarda nombre y teléfono en el perfil SOLO si faltan (así la próxima reserva viene precargada y no se
// pisan datos que la clienta ya tenía). Un fallo aquí no afecta a la reserva ya hecha.
async function fillProfileIfMissing(
  client: SupabaseClient<Database>,
  userId: string,
  name: string,
  phone: string,
): Promise<void> {
  try {
    const { data: profile } = await client.from('profiles').select('full_name, phone').eq('id', userId).maybeSingle();
    if (!profile) return;
    const patch = {
      ...(profile.full_name ? {} : { full_name: name }),
      ...(profile.phone ? {} : { phone }),
    };
    if (Object.keys(patch).length === 0) return;
    await client.from('profiles').update(patch).eq('id', userId);
  } catch {
    // La reserva ya está hecha.
  }
}

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

// Cuenta con la que se reserva (T-021). La pone el servidor desde la sesión; nunca viene de la entrada.
export type BookingAccountContext = { userId: string; email: string };

// Pone el email de la cuenta en la entrada cruda: con sesión, el email del formulario se ignora (CA-45).
function withAccountEmail(input: unknown, account: BookingAccountContext | null): unknown {
  if (!account || typeof input !== 'object' || input === null) return input;
  return { ...input, email: account.email };
}

// Crea la reserva (T-005b, T-021). Orden: honeypot → Zod → función de BD (ADR-0015).
// Los errores de la BD se traducen a respuestas estables; los desconocidos no revelan detalles.
// `ipHash` es el hash de la IP del visitante (nunca la IP) o null si no se aplica el límite por IP.
// `account` es la cuenta de la sesión (o null: reserva de invitada). La cita se guarda con su `user_id`
// y con la copia de contacto, como una invitada (ADR-0034).
export async function createBooking(
  input: unknown,
  context: { ipHash: string | null; account?: BookingAccountContext | null } = { ipHash: null },
): Promise<CreatedBooking | BookingFailure> {
  const account = context.account ?? null;
  // El honeypot se mira sobre la entrada cruda y responde igual que un fallo ordinario (CA-28).
  if (isHoneypotTriggered(input)) return { ok: false, error: 'UNAVAILABLE' };

  const parsed = BookingFormSchema.safeParse(withAccountEmail(input, account));
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
    ...(context.ipHash ? { p_ip_hash: context.ipHash } : {}),
    p_max_active_per_email: BOOKING_LIMITS.maxActivePerEmail,
    p_max_per_ip: BOOKING_LIMITS.maxPerIp,
    p_ip_window_minutes: BOOKING_LIMITS.ipWindowMinutes,
    ...(account ? { p_user_id: account.userId } : {}),
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
    if (error.message === 'LIMIT_EMAIL') return { ok: false, error: 'LIMIT_EMAIL' };
    if (error.message === 'LIMIT_IP') return { ok: false, error: 'LIMIT_IP' };
    return { ok: false, error: 'UNAVAILABLE' };
  }

  const appointmentId = rows?.[0]?.appointment_id;
  if (!appointmentId) return { ok: false, error: 'UNAVAILABLE' };
  if (account) await fillProfileIfMissing(client, account.userId, data.name, data.phone);
  return { ok: true, appointmentId };
}
