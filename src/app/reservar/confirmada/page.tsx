import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { CONFIRMATION_COOKIE } from '@/lib/booking/confirmation-cookie';
import { formatLongDate, formatSlotTime, madridDateOf } from '@/lib/booking/dates';
import { loadConfirmation } from '@/lib/booking/load-confirmation';
import { LINK_ROW_CLASS, PageWithAside, TEXT_LINK_CLASS } from '@/components/layout/page-with-aside';
import { ROUTES } from '@/lib/routes';
import { formatPriceFrom } from '@/lib/services/catalog';

export const metadata: Metadata = {
  title: 'Reserva confirmada',
  robots: { index: false, follow: false },
};

// Muestra decorativa estable por servicio (1-8); la confirmación no conoce la posición en la carta.
function swatchOf(name: string): number {
  let sum = 0;
  for (const char of name) sum += char.codePointAt(0) ?? 0;
  return (sum % 8) + 1;
}

// Depende de una cookie de la persona que acaba de reservar.
export const dynamic = 'force-dynamic';

export default async function ReservaConfirmadaPage() {
  const store = await cookies();
  const confirmation = await loadConfirmation(store.get(CONFIRMATION_COOKIE)?.value);

  return (
    <PageWithAside>
      {confirmation ? (
        <>
          <h1 className="font-display text-display font-semibold">Reserva confirmada</h1>
          <p className="mt-3 text-fg-muted">Tu cita está reservada. Estos son sus datos:</p>

          {confirmation.emailSent ? (
            <p role="status" className="mt-6 border-y border-border-strong py-4 text-fg">
              Te hemos enviado un email con el enlace personal de tu cita.
            </p>
          ) : (
            <p role="alert" className="mt-6 border-y border-danger py-4 text-fg">
              No hemos podido enviarte el email de confirmación. Tu cita está reservada; si necesitas
              gestionarla, consulta nuestro contacto.
            </p>
          )}

          <section aria-label="Datos de la cita" className="mt-8 border border-border-strong bg-surface p-5 sm:p-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG propio, decorativo, con tamaño reservado */}
            <img
              src={`/images/carta/muestra-${swatchOf(confirmation.serviceName)}-h.svg`}
              alt=""
              width={440}
              height={120}
              className="h-auto w-full max-w-md"
            />
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
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
                <dd className="font-semibold tabular-nums">{formatSlotTime(confirmation.startsAt)}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">Precio</dt>
                <dd className="font-semibold tabular-nums text-accent-text">
                  {formatPriceFrom(confirmation.priceFromCents)}
                </dd>
              </div>
            </dl>
          </section>

          <div className={`mt-8 ${LINK_ROW_CLASS}`}>
            <Link href={ROUTES.home} className={TEXT_LINK_CLASS}>
              Volver al inicio
            </Link>
            <Link href={ROUTES.reservar} className={TEXT_LINK_CLASS}>
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
          <div className={`mt-8 ${LINK_ROW_CLASS}`}>
            <Link href={ROUTES.reservar} className={TEXT_LINK_CLASS}>
              Reservar una cita
            </Link>
            <Link href={ROUTES.contacto} className={TEXT_LINK_CLASS}>
              Contacto
            </Link>
          </div>
        </>
      )}
    </PageWithAside>
  );
}
