import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loadMyAppointments, type MyAppointment } from '@/lib/account/load-my-appointments';
import { formatLongDate, formatSlotTime, madridDateOf } from '@/lib/booking/dates';
import { STATUS_LABELS } from '@/lib/booking/status';
import { ROUTES } from '@/lib/routes';
import { signOutAction } from './actions';

export const metadata: Metadata = {
  title: 'Mis citas',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-6 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';
const BUTTON_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control px-6 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';
const CTA_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover';

function AppointmentCard({ appointment }: { appointment: MyAppointment }) {
  return (
    <li className="rounded-container bg-surface p-6 shadow-card">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-fg-muted">Servicio</dt>
          <dd className="font-semibold">{appointment.serviceName}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">Estilista</dt>
          <dd className="font-semibold">{appointment.stylistName}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">Día</dt>
          <dd className="font-semibold first-letter:uppercase">
            {formatLongDate(madridDateOf(appointment.startsAt))}
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted">Hora</dt>
          <dd className="font-semibold">{formatSlotTime(appointment.startsAt)}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">Estado</dt>
          <dd className="font-semibold">{STATUS_LABELS[appointment.status]}</dd>
        </div>
      </dl>
    </li>
  );
}

export default async function MisCitasPage() {
  const result = await loadMyAppointments();
  if (result.state === 'anonymous') redirect(ROUTES.acceso);

  if (result.state === 'error') {
    return (
      <section className="mx-auto w-full max-w-3xl px-(--layout-gutter) py-12 sm:py-16">
        <h1 className="font-display text-display font-semibold">Mis citas</h1>
        <p role="alert" className="mt-6 rounded-card bg-accent-soft p-4 text-fg">
          No hemos podido cargar tus citas. Inténtalo de nuevo en unos minutos.
        </p>
      </section>
    );
  }

  const isEmpty = result.upcoming.length === 0 && result.past.length === 0;

  return (
    <section className="mx-auto w-full max-w-3xl px-(--layout-gutter) py-12 sm:py-16">
      <h1 className="font-display text-display font-semibold">Mis citas</h1>
      {result.email ? <p className="mt-3 text-fg-muted">Has entrado como {result.email}.</p> : null}

      {isEmpty ? (
        <div className="mt-8 rounded-container bg-surface p-6 shadow-card">
          <p className="font-semibold">Todavía no tienes citas en tu cuenta.</p>
          <p className="mt-2 text-fg-muted">
            Las citas reservadas como invitada siguen en el enlace del email de confirmación.
          </p>
          <div className="mt-6">
            <Link href={ROUTES.reservar} className={CTA_CLASS}>
              Reservar una cita
            </Link>
          </div>
        </div>
      ) : null}

      {result.upcoming.length > 0 ? (
        <>
          <h2 className="mt-10 font-display text-2xl font-semibold">Próximas</h2>
          <ul className="mt-4 space-y-4">
            {result.upcoming.map((a) => (
              <AppointmentCard key={a.id} appointment={a} />
            ))}
          </ul>
        </>
      ) : null}

      {result.past.length > 0 ? (
        <>
          <h2 className="mt-10 font-display text-2xl font-semibold">Anteriores y canceladas</h2>
          <ul className="mt-4 space-y-4">
            {result.past.map((a) => (
              <AppointmentCard key={a.id} appointment={a} />
            ))}
          </ul>
        </>
      ) : null}

      <div className="mt-10 flex flex-wrap gap-2">
        <Link href={ROUTES.home} className={LINK_CLASS}>
          Volver al inicio
        </Link>
        <form action={signOutAction}>
          <button type="submit" className={BUTTON_CLASS}>
            Salir
          </button>
        </form>
      </div>
    </section>
  );
}
