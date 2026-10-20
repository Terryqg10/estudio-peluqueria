import type { Database } from '@/lib/database.types';

type AppointmentStatus = Database['public']['Enums']['appointment_status'];

// Etiquetas en español de los estados de cita (ADR-0010). En la BD son valores en inglés.
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  completed: 'Completada',
  no_show: 'No asistió',
  cancelled: 'Cancelada',
};
