'use server';

import { cookies, headers } from 'next/headers';
import { getAvailability } from '@/lib/availability/get-availability';
import { findNextDaysWithSlots } from '@/lib/availability/next-days';
import type { NextDaysResult } from '@/lib/availability/next-days';
import type { AvailabilityResult } from '@/lib/availability/schema';
import { getClientIpHash } from '@/lib/booking/client-ip.server';
import { CONFIRMATION_COOKIE, confirmationCookieOptions } from '@/lib/booking/confirmation-cookie';
import { createBooking } from '@/lib/booking/create-booking';
import type { BookingResult } from '@/lib/booking/schema';
import { sendBookingConfirmation } from '@/lib/booking/send-confirmation';

// Acciones de servidor de la reserva. La entrada llega del navegador, así que se valida
// con Zod dentro de cada función (RNF-02); aquí solo se exponen.
export async function loadAvailabilityAction(input: unknown): Promise<AvailabilityResult> {
  return getAvailability(input);
}

export async function loadNextDaysAction(input: unknown): Promise<NextDaysResult> {
  return findNextDaysWithSlots(input);
}

// Crea la reserva (T-005b). Si va bien, deja una cookie httpOnly con el id de la cita para la
// página de confirmación; nunca se devuelven datos personales ni identificadores al cliente.
export async function createBookingAction(input: unknown): Promise<BookingResult> {
  // Hash de la IP para el límite por IP (ADR-0020). Si en producción falta la sal, se falla cerrado.
  const requestHeaders = await headers();
  const ip = getClientIpHash(requestHeaders);
  if (!ip.ok) return { ok: false, error: 'UNAVAILABLE' };

  const outcome = await createBooking(input, { ipHash: ip.ipHash });
  if (!outcome.ok) return outcome;
  const store = await cookies();
  store.set(
    CONFIRMATION_COOKIE,
    outcome.appointmentId,
    confirmationCookieOptions(requestHeaders.get('x-forwarded-proto')),
  );

  // Email con el enlace personal de la cita (T-006a, ADR-0018). Nunca lanza: si falla, la cita se
  // mantiene y la página de confirmación avisa leyendo la marca `confirmation_email_sent_at`.
  await sendBookingConfirmation(outcome.appointmentId);
  return { ok: true };
}
