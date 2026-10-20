'use server';

import { cancelAppointment, type CancelResult } from '@/lib/booking/cancel-appointment';

// Cancela la cita desde su enlace (T-006b). La entrada llega del navegador: se valida con Zod
// dentro de `cancelAppointment` (RNF-02).
export async function cancelAppointmentAction(token: unknown): Promise<CancelResult> {
  return cancelAppointment(token);
}
