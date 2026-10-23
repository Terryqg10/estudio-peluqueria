import Link from 'next/link';
import { formatSlotTime } from '@/lib/booking/dates';
import { STATUS_LABELS } from '@/lib/booking/status';
import { ROUTES } from '@/lib/routes';
import type { AgendaAppointment } from '@/lib/admin/load-week-agenda';

// Una cita de la agenda. El detalle (teléfono, email) va en un <details>: se abre con teclado y sin
// JavaScript. El estado se dice con texto, no solo con color.
export function AppointmentBlock({ appointment }: { appointment: AgendaAppointment }) {
  const cancelled = appointment.status === 'cancelled';
  return (
    <details
      data-appointment-id={appointment.id}
      data-status={appointment.status}
      className="break-words rounded-card border border-border-strong bg-surface text-left"
    >
      <summary className="min-h-11 cursor-pointer list-none px-3 py-2">
        <span className="block font-semibold">
          {formatSlotTime(appointment.startsAt)}–{formatSlotTime(appointment.endsAt)}
        </span>
        <span className={`block ${cancelled ? 'line-through' : ''}`}>{appointment.clientName}</span>
        <span className="block text-fg-muted">{appointment.serviceName}</span>
        <span className="block text-fg-muted">{STATUS_LABELS[appointment.status]}</span>
      </summary>
      <dl className="space-y-1 border-t border-border-strong px-3 py-2">
        <div>
          <dt className="text-fg-muted">Teléfono</dt>
          <dd>
            {appointment.phone ? (
              <a
                href={`tel:${appointment.phone.replace(/[^\d+]/g, '')}`}
                className="inline-flex min-h-11 items-center text-accent-text"
              >
                {appointment.phone}
              </a>
            ) : (
              'Sin teléfono'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted">Email</dt>
          <dd className="break-all">{appointment.email ?? 'Sin email'}</dd>
        </div>
      </dl>
      {cancelled || appointment.status === 'completed' || appointment.status === 'no_show' ? null : (
        <p className="border-t border-border-strong px-3 py-2">
          <Link
            href={`${ROUTES.adminAgenda}/cita/${appointment.id}`}
            className="inline-flex min-h-11 items-center text-accent-text"
          >
            Editar cita
          </Link>
        </p>
      )}
    </details>
  );
}
