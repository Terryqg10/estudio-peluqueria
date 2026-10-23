import type { Metadata } from 'next';
import Link from 'next/link';
import { formatLongDate, formatSlotTime, madridDateOf } from '@/lib/booking/dates';
import { loadGuestAppointment } from '@/lib/booking/load-guest-appointment';
import { STATUS_LABELS } from '@/lib/booking/status';
import { LINK_ROW_CLASS, PageWithAside, TEXT_LINK_CLASS } from '@/components/layout/page-with-aside';
import { ROUTES } from '@/lib/routes';
import { formatPriceFrom } from '@/lib/services/catalog';
import { DeleteData } from '@/components/privacy/delete-data';
import { deleteGuestDataAction } from './actions';
import { CancelAppointment } from './cancel-appointment';

// El token va en la URL: no se indexa, no se cachea y no se envía a terceros en la cabecera Referer
// (ADR-0018).
export const metadata: Metadata = {
  title: 'Tu cita',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

const CHANGE_TEXT_LINK_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover';

export default async function CitaPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const appointment = await loadGuestAppointment(token);

  if (!appointment && query.borrado === '1') {
    return (
      <PageWithAside>
        <h1 className="font-display text-display font-semibold">Datos borrados</h1>
        <p role="status" className="mt-3 max-w-prose text-fg-muted">
          Hemos borrado tus datos personales. Tus citas futuras han quedado canceladas y este enlace ya no
          funciona.
        </p>
        <div className={`mt-8 ${LINK_ROW_CLASS}`}>
          <Link href={ROUTES.home} className={TEXT_LINK_CLASS}>
            Volver al inicio
          </Link>
        </div>
      </PageWithAside>
    );
  }

  if (!appointment) {
    return (
      <PageWithAside>
        <h1 className="font-display text-display font-semibold">Enlace no válido o caducado</h1>
        <p className="mt-3 max-w-prose text-fg-muted">
          Este enlace no existe, está incompleto o ya ha caducado. Si necesitas ayuda con tu cita,
          consulta nuestro contacto.
        </p>
        <div className={`mt-8 ${LINK_ROW_CLASS}`}>
          <Link href={ROUTES.contacto} className={TEXT_LINK_CLASS}>
            Contacto
          </Link>
          <Link href={ROUTES.reservar} className={TEXT_LINK_CLASS}>
            Reservar una cita
          </Link>
          <Link href={ROUTES.borrarDatos} className={TEXT_LINK_CLASS}>
            Borrar mis datos
          </Link>
        </div>
      </PageWithAside>
    );
  }

  const isActive = appointment.status === 'confirmed' || appointment.status === 'pending';
  // Tras cambiar la cita se vuelve aquí con ?cambiada=1 (T-006c): solo un aviso, sin datos.
  const justChanged = query.cambiada === '1' && isActive;

  return (
    <PageWithAside>
      <h1 className="font-display text-display font-semibold">Tu cita</h1>
      <p className="mt-3 text-fg-muted">Estos son los datos de tu cita.</p>

      {justChanged ? (
        <p role="status" className="mt-6 rounded-card bg-accent-soft p-4 text-fg">
          Hemos cambiado tu cita. Estos son sus nuevos datos.
        </p>
      ) : null}

      <dl className="mt-8 grid gap-4 rounded-container bg-surface p-6 shadow-card sm:grid-cols-2">
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
        {appointment.priceFromCents !== null ? (
          <div>
            <dt className="text-fg-muted">Precio</dt>
            <dd className="font-semibold text-accent-text">{formatPriceFrom(appointment.priceFromCents)}</dd>
          </div>
        ) : null}
      </dl>

      {isActive ? (
        appointment.canChange ? (
          <>
            <div className="mt-8">
              <Link href={`${ROUTES.cita}/${token}/cambiar`} className={CHANGE_TEXT_LINK_CLASS}>
                Cambiar cita
              </Link>
            </div>
            <CancelAppointment token={token} />
          </>
        ) : (
          <p className="mt-8 rounded-card bg-accent-soft p-4 text-fg">
            Faltan menos de 24 horas para tu cita y ya no se puede cancelar ni cambiar desde aquí.
            Contacta con el salón.
          </p>
        )
      ) : null}

      <div className={`mt-8 ${LINK_ROW_CLASS}`}>
        {appointment.status === 'cancelled' ? (
          <Link href={ROUTES.reservar} className={TEXT_LINK_CLASS}>
            Reservar otra cita
          </Link>
        ) : null}
        <Link href={ROUTES.home} className={TEXT_LINK_CLASS}>
          Volver al inicio
        </Link>
        <Link href={ROUTES.contacto} className={TEXT_LINK_CLASS}>
          Contacto
        </Link>
      </div>

      <div className="mt-10 border-t border-border pt-8">
        <h2 className="font-display text-2xl font-semibold">Tus datos</h2>
        <p className="mt-2 max-w-prose text-fg-muted">
          Puedes pedir que borremos tus datos personales. Es una acción definitiva.
        </p>
        <DeleteData
          kind="guest"
          action={deleteGuestDataAction.bind(null, token)}
          doneHref={`${ROUTES.cita}/${token}?borrado=1`}
        />
      </div>
    </PageWithAside>
  );
}
