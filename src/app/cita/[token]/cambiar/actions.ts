'use server';

import {
  loadRescheduleAvailability,
  rescheduleAppointment,
  type RescheduleAvailabilityResult,
  type RescheduleResult,
} from '@/lib/booking/reschedule-appointment';
import { sendChangeNotice } from '@/lib/booking/send-change-notice';

// Acciones de servidor del cambio de cita (T-006c). La entrada llega del navegador: se valida con
// Zod dentro de cada función (RNF-02).
export async function rescheduleAppointmentAction(input: unknown): Promise<RescheduleResult> {
  // Aviso por email tras confirmar la BD (T-006d). Nunca lanza ni cambia el resultado.
  return rescheduleAppointment(input, (id) => sendChangeNotice(id, 'rescheduled'));
}

export async function loadRescheduleAvailabilityAction(
  input: unknown,
): Promise<RescheduleAvailabilityResult> {
  return loadRescheduleAvailability(input);
}
