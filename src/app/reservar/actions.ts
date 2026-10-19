'use server';

import { cookies, headers } from 'next/headers';
import { getAvailability } from '@/lib/availability/get-availability';
import { findNextDaysWithSlots } from '@/lib/availability/next-days';
import type { NextDaysResult } from '@/lib/availability/next-days';
import type { AvailabilityResult } from '@/lib/availability/schema';
import { CONFIRMATION_COOKIE, confirmationCookieOptions } from '@/lib/booking/confirmation-cookie';
import { createBooking } from '@/lib/booking/create-booking';
import type { BookingResult } from '@/lib/booking/schema';

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
  const outcome = await createBooking(input);
  if (!outcome.ok) return outcome;
  const [store, requestHeaders] = await Promise.all([cookies(), headers()]);
  store.set(
    CONFIRMATION_COOKIE,
    outcome.appointmentId,
    confirmationCookieOptions(requestHeaders.get('x-forwarded-proto')),
  );
  return { ok: true };
}
