// Límites antiabuso de la reserva de invitada (RF-10, CA-29, ADR-0020). Un único sitio para los
// valores; se pasan a `create_booking`, que los aplica en la BD. VERIFICAR los valores con el salón.
export const BOOKING_LIMITS = {
  // Citas activas (pendientes o confirmadas y aún no terminadas) por email.
  maxActivePerEmail: 3,
  // Reservas creadas por IP dentro de la ventana (la IP solo se guarda como hash con sal).
  maxPerIp: 10,
  ipWindowMinutes: 60,
} as const;
