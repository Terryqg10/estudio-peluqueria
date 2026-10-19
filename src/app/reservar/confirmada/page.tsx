import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { CONFIRMATION_COOKIE } from '@/lib/booking/confirmation-cookie';
import { formatLongDate, formatSlotTime, madridDateOf } from '@/lib/booking/dates';
import { loadConfirmation } from '@/lib/booking/load-confirmation';
import { ROUTES } from '@/lib/routes';
import { formatPriceFrom } from '@/lib/services/catalog';

export const metadata: Metadata = {
  title: 'Reserva confirmada',
  robots: { index: false, follow: false },
};

// Depende de una cookie de la persona que acaba de reservar.
export const dynamic = 'force-dynamic';

const LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-6 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';

export default async function ReservaConfirmadaPage() {
  const store = await cookies();
  const confirmation = await loadConfirmation(store.get(CONFIRMATION_COOKIE)?.value);

  return (
    <section className="mx-auto w-full max-w-3xl px-(--layout-gutter) py-12 sm:py-16">
      {confirmation ? (
        <>
          <h1 className="font-display text-display font-semibold">Reserva confirmada</h1>
          <p className="mt-3 text-fg-muted">Tu cita está reservada. Estos son sus datos:</p>

          <dl className="mt-8 grid gap-4 rounded-container bg-surface p-6 shadow-card sm:grid-cols-2">
            <div>
              <dt className="text-fg-muted">Servicio</dt>
              <dd className="font-semibold">{confirmation.serviceName}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Estilista</dt>
              <dd className="font-semibold">{confirmation.stylistName}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Día</dt>
              <dd className="font-semibold first-letter:uppercase">
                {formatLongDate(madridDateOf(confirmation.startsAt))}
              </dd>
            </div>
            <div>
              <dt className="text-fg-muted">Hora</dt>
              <dd className="font-semibold">{formatSlotTime(confirmation.startsAt)}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Precio</dt>
              <dd className="font-semibold text-accent-text">
                {formatPriceFrom(confirmation.priceFromCents)}
              </dd>
            </div>
          </dl>

          <div className="mt-8 flex flex-wrap gap-2">
            <Link href={ROUTES.home} className={LINK_CLASS}>
              Volver al inicio
            </Link>
            <Link href={ROUTES.reservar} className={LINK_CLASS}>
              Hacer otra reserva
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 className="font-display text-display font-semibold">No encontramos tu reserva</h1>
          <p className="mt-3 max-w-prose text-fg-muted">
            Este enlace solo funciona justo después de reservar y durante unos minutos. Si acabas
            de hacerlo y no ves tu reserva, consulta nuestro contacto.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Link href={ROUTES.reservar} className={LINK_CLASS}>
              Reservar una cita
            </Link>
            <Link href={ROUTES.contacto} className={LINK_CLASS}>
              Contacto
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
