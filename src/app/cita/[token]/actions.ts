'use server';

import { deleteGuestData, type DeleteGuestDataResult } from '@/lib/privacy/delete-guest-data';
import { sendChangeNotice } from '@/lib/booking/send-change-notice';
import { cancelAppointment, type CancelResult } from '@/lib/booking/cancel-appointment';

// Cancela la cita desde su enlace (T-006b). La entrada llega del navegador: se valida con Zod
// dentro de `cancelAppointment` (RNF-02).
export async function cancelAppointmentAction(token: unknown): Promise<CancelResult> {
  // Aviso por email tras confirmar la BD (T-006d). Nunca lanza ni cambia el resultado.
  return cancelAppointment(token, (id) => sendChangeNotice(id, 'cancelled'));
}

// Borra los datos de la invitada desde su enlace (T-012, CA-26). Se valida con Zod dentro de
// `deleteGuestData` (RNF-02).
export async function deleteGuestDataAction(token: unknown): Promise<DeleteGuestDataResult> {
  return deleteGuestData(token);
}
