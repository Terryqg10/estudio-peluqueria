'use server';

import {
  loadRescheduleAvailability,
  rescheduleAppointment,
  type RescheduleAvailabilityResult,
  type RescheduleResult,
} from '@/lib/booking/reschedule-appointment';

// Acciones de servidor del cambio de cita (T-006c). La entrada llega del navegador: se valida con
// Zod dentro de cada función (RNF-02).
export async function rescheduleAppointmentAction(input: unknown): Promise<RescheduleResult> {
  return rescheduleAppointment(input);
}

export async function loadRescheduleAvailabilityAction(
  input: unknown,
): Promise<RescheduleAvailabilityResult> {
  return loadRescheduleAvailability(input);
}
