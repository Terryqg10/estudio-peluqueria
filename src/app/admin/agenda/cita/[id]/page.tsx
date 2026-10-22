import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/account/require-admin';
import { loadAdminAppointment, loadMoveSlots, type ManageError } from '@/lib/admin/manage-appointment';
import { LocalDateSchema, mondayOf, weekHref } from '@/lib/admin/week';
import { formatLongDate, formatSlotTime } from '@/lib/booking/dates';
import { STATUS_LABELS } from '@/lib/booking/status';
import { ROUTES } from '@/lib/routes';
import { cancelAppointmentAction, moveAppointmentAction } from './actions';

export const metadata: Metadata = { title: 'Cita' };
export const dynamic = 'force-dynamic';

const LINK_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control px-4 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';
const CTA_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover';
const DANGER_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong px-6 font-semibold text-fg transition-colors duration-(--duration-fast) hover:bg-surface-muted';
const FIELD_CLASS = 'min-h-11 rounded-control border border-border-strong bg-surface px-3 text-fg';

const ERRORS: Record<ManageError, string> = {
  FORBIDDEN: 'No tienes permiso para esta acción.',
  NOT_FOUND: 'La cita ya no existe.',
  INVALID_STATE: 'La cita ya está cancelada o completada y no se puede modificar.',
  INVALID_INPUT: 'Elige un hueco de la lista.',
  NO_CHANGE: 'Elige un hueco distinto del actual.',
  SLOT_TAKEN: 'Ese hueco acaba de ocuparse o ya no está disponible. Elige otro.',
  UNAVAILABLE: 'No hemos podido guardar el cambio. Inténtalo de nuevo en unos minutos.',
};

type SearchParams = Promise<{ dia?: string; error?: string; cancelar?: string }>;

export default async function AppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const admin = await requireAdmin(); // un layout no basta (ADR-0022)
  const { id } = await params;
  const query = await searchParams;

  const appointment = await loadAdminAppointment(admin.client, id);
  if (appointment === null) notFound();

  const back = (date: string) => weekHref(ROUTES.adminAgenda, mondayOf(date), date);

  if (appointment === 'error') {
    return (
      <section className="mx-auto w-full max-w-3xl px-(--layout-gutter) py-12 sm:py-16">
        <h1 className="font-display text-display font-semibold">Cita</h1>
        <p role="alert" className="mt-6 rounded-card bg-accent-soft p-4 text-fg">
          No hemos podido cargar la cita. Inténtalo de nuevo en unos minutos.
        </p>
      </section>
    );
  }

  const active = appointment.status === 'confirmed' || appointment.status === 'pending';
  const dayParsed = LocalDateSchema.safeParse(query.dia);
  const slotDay = dayParsed.success ? dayParsed.data : appointment.date;
  const slots = active ? await loadMoveSlots(admin.client, appointment.id, slotDay) : [];
  const errorMessage =
    query.error && query.error in ERRORS ? ERRORS[query.error as ManageError] : null;

  return (
    <section className="mx-auto w-full max-w-3xl px-(--layout-gutter) py-12 sm:py-16">
      <p>
        <Link href={back(appointment.date)} className={LINK_CLASS}>
          Volver a la agenda
        </Link>
      </p>
      <h1 className="font-display text-display font-semibold">Cita</h1>

      {errorMessage ? (
        <p role="alert" className="mt-6 rounded-card bg-accent-soft p-4 text-fg">
          {errorMessage}
        </p>
      ) : null}

      <dl className="mt-6 grid gap-4 rounded-container bg-surface p-6 shadow-card sm:grid-cols-2">
        <div>
          <dt className="text-fg-muted">Clienta</dt>
          <dd className="font-semibold">{appointment.clientName}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">Servicio</dt>
          <dd className="font-semibold">{appointment.serviceName}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">Estilista</dt>
          <dd className="font-semibold">{appointment.stylistName}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">Día y hora</dt>
          <dd className="font-semibold">
            <span className="first-letter:uppercase">{formatLongDate(appointment.date)}</span>,{' '}
            {formatSlotTime(appointment.startsAt)}–{formatSlotTime(appointment.endsAt)}
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted">Estado</dt>
          <dd className="font-semibold">{STATUS_LABELS[appointment.status]}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">Contacto</dt>
          <dd className="break-all font-semibold">
            {appointment.phone ?? 'Sin teléfono'}
            {appointment.email ? <span className="block">{appointment.email}</span> : null}
          </dd>
        </div>
      </dl>

      {!active ? (
        <p className="mt-6 text-fg-muted">Esta cita ya no se puede modificar.</p>
      ) : (
        <>
          <h2 className="mt-10 font-display text-2xl font-semibold">Mover la cita</h2>
          <form method="get" className="mt-4 flex flex-wrap items-end gap-3" aria-label="Elegir el día">
            <div className="flex flex-col gap-1">
              <label htmlFor="dia" className="text-fg-muted">
                Día
              </label>
              <input id="dia" name="dia" type="date" defaultValue={slotDay} required className={FIELD_CLASS} />
            </div>
            <button type="submit" className={LINK_CLASS}>
              Ver huecos
            </button>
          </form>

          {slots === 'error' ? (
            <p role="alert" className="mt-4 rounded-card bg-accent-soft p-4 text-fg">
              No hemos podido cargar los huecos. Inténtalo de nuevo.
            </p>
          ) : slots.length === 0 ? (
            <p className="mt-4 text-fg-muted">No hay huecos libres ese día.</p>
          ) : (
            <form action={moveAppointmentAction} className="mt-4">
              <input type="hidden" name="id" value={appointment.id} />
              <input type="hidden" name="dia" value={slotDay} />
              <fieldset>
                <legend className="font-semibold first-letter:uppercase">{formatLongDate(slotDay)}</legend>
                <div className="mt-3 space-y-4">
                  {[...new Set(slots.map((s) => s.stylistId))].map((stylistId) => {
                    const own = slots.filter((s) => s.stylistId === stylistId);
                    return (
                      <div key={stylistId}>
                        <p className="text-fg-muted">{own[0]?.stylistName}</p>
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {own.map((s) => {
                            const value = `${s.stylistId}|${s.startsAt}`;
                            return (
                              <li key={value}>
                                <label className="flex min-h-11 min-w-16 cursor-pointer items-center justify-center rounded-card border border-border-strong bg-surface px-3 has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-fg has-[:focus-visible]:outline-2">
                                  <input type="radio" name="slot" value={value} required className="sr-only" />
                                  <span>
                                    <span className="sr-only">{own[0]?.stylistName}, </span>
                                    {formatSlotTime(s.startsAt)}
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
              <div className="mt-6">
                <button type="submit" className={CTA_CLASS}>
                  Guardar cambios
                </button>
              </div>
            </form>
          )}

          <h2 className="mt-10 font-display text-2xl font-semibold">Cancelar la cita</h2>
          {query.cancelar === '1' ? (
            <form action={cancelAppointmentAction} className="mt-4 rounded-container bg-surface p-6 shadow-card">
              <input type="hidden" name="id" value={appointment.id} />
              <input type="hidden" name="dia" value={appointment.date} />
              <p className="font-semibold">¿Cancelar la cita de {appointment.clientName}?</p>
              <p className="mt-2 text-fg-muted">
                El hueco quedará libre en la web. La clienta no recibe ningún aviso: avísala tú.
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
        </>
      )}
    </section>
  );
}
