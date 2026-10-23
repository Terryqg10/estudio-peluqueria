import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/account/require-admin';
import {
  loadAdminAppointment,
  loadMoveSlots,
  loadStylistOptions,
  type ManageError,
} from '@/lib/admin/manage-appointment';
import { mondayOf, weekHref } from '@/lib/admin/week';
import { formatLongDate, formatSlotTime, todayInMadrid } from '@/lib/booking/dates';
import { STATUS_LABELS } from '@/lib/booking/status';
import { ROUTES } from '@/lib/routes';
import { cancelAppointmentAction } from './actions';
import { MoveForm } from './move-form';

export const metadata: Metadata = { title: 'Cita' };
export const dynamic = 'force-dynamic';

const LINK_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control px-4 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';
const CTA_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover';
const DANGER_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong px-6 font-semibold text-fg transition-colors duration-(--duration-fast) hover:bg-surface-muted';

const ERRORS: Record<ManageError, string> = {
  FORBIDDEN: 'No tienes permiso para esta acción.',
  NOT_FOUND: 'La cita ya no existe.',
  INVALID_STATE: 'La cita ya está cancelada o completada y no se puede modificar.',
  INVALID_INPUT: 'Revisa los datos: elige un hueco de la lista y una nota de hasta 500 caracteres.',
  NO_CHANGE: 'Elige un hueco distinto del actual.',
  SLOT_TAKEN: 'Ese hueco acaba de ocuparse o ya no está disponible. Elige otro.',
  UNAVAILABLE: 'No hemos podido guardar el cambio. Inténtalo de nuevo en unos minutos.',
};

type SearchParams = Promise<{ error?: string; cancelar?: string }>;

export default async function AppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const admin = await requirePanel(); // un layout no basta (ADR-0022)
  const { id } = await params;
  const query = await searchParams;

  const appointment = await loadAdminAppointment(admin.client, id);
  if (appointment === null) notFound();

  if (appointment === 'error') {
    return (
      <section className="max-w-3xl">
        <h1 className="font-display text-display font-semibold">Mover cita</h1>
        <p role="alert" className="mt-6 rounded-card bg-accent-soft p-4 text-fg">
          No hemos podido cargar la cita. Inténtalo de nuevo en unos minutos.
        </p>
      </section>
    );
  }

  const active = appointment.status === 'confirmed' || appointment.status === 'pending';
  // La cuenta demo (solo lectura) no mueve ni cancela: no se piden huecos (las funciones del Admin la rechazan).
  const editable = active && !admin.readOnly;
  const [stylists, initialSlots] = editable
    ? await Promise.all([
        loadStylistOptions(admin.client, appointment.id),
        loadMoveSlots(admin.client, appointment.id, appointment.date),
      ])
    : [[], []];
  const loadFailed = stylists === 'error' || initialSlots === 'error';
  const errorMessage = query.error && query.error in ERRORS ? ERRORS[query.error as ManageError] : null;
  const backHref = weekHref(ROUTES.adminAgenda, mondayOf(appointment.date), appointment.date);

  return (
    <section className="max-w-3xl">
      <p className="-ml-4">
        <Link href={backHref} className={LINK_CLASS}>
          Volver a la agenda
        </Link>
      </p>
      <h1 className="font-display text-display font-semibold">Mover cita</h1>
      <p className="mt-3 text-fg-muted">
        Ahora: <span className="first-letter:uppercase">{formatLongDate(appointment.date)}</span>,{' '}
        {formatSlotTime(appointment.startsAt)}–{formatSlotTime(appointment.endsAt)} con{' '}
        {appointment.stylistName} · {STATUS_LABELS[appointment.status]}
      </p>

      {errorMessage ? (
        <p role="alert" className="mt-6 rounded-card bg-accent-soft p-4 text-fg">
          {errorMessage}
        </p>
      ) : null}

      {admin.readOnly ? (
        <p className="mt-8 rounded-container bg-surface p-6 text-fg-muted shadow-card">
          En la demo no se pueden mover ni cancelar citas: solo se puede mirar.
        </p>
      ) : !active ? (
        <p className="mt-8 rounded-container bg-surface p-6 text-fg-muted shadow-card">
          Esta cita ya no se puede modificar.
        </p>
      ) : loadFailed ? (
        <p role="alert" className="mt-8 rounded-card bg-accent-soft p-4 text-fg">
          No hemos podido cargar los huecos. Inténtalo de nuevo en unos minutos.
        </p>
      ) : (
        <MoveForm
          appointmentId={appointment.id}
          clientName={appointment.clientName}
          serviceName={appointment.serviceName}
          currentStylistId={appointment.stylistId}
          currentStartsAt={appointment.startsAt}
          currentDate={appointment.date}
          today={todayInMadrid()}
          stylists={stylists}
          initialSlots={initialSlots.map((s) => ({ stylistId: s.stylistId, startsAt: s.startsAt }))}
          initialNote={appointment.note}
        />
      )}

      {editable ? (
        <div className="mt-12 border-t border-border pt-8">
          <h2 className="font-display text-2xl font-semibold">Cancelar la cita</h2>
          {query.cancelar === '1' ? (
            <form action={cancelAppointmentAction} className="mt-4 rounded-container bg-surface p-6 shadow-card">
              <input type="hidden" name="id" value={appointment.id} />
              <input type="hidden" name="dia" value={appointment.date} />
              <p className="font-semibold">¿Cancelar la cita de {appointment.clientName}?</p>
              <p className="mt-2 text-fg-muted">
                El hueco quedará libre en la web. Le enviaremos un email con el aviso.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="submit" className={CTA_CLASS}>
                  Sí, cancelar la cita
                </button>
                <Link href={`${ROUTES.adminAgenda}/cita/${appointment.id}`} className={LINK_CLASS}>
                  No, mantenerla
                </Link>
              </div>
            </form>
          ) : (
            <p className="mt-4">
              <Link href={`${ROUTES.adminAgenda}/cita/${appointment.id}?cancelar=1`} className={DANGER_CLASS}>
                Cancelar la cita
              </Link>
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
