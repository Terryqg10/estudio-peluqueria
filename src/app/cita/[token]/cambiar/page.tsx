import type { Metadata } from 'next';
import Link from 'next/link';
import { todayInMadrid } from '@/lib/booking/dates';
import { loadBookingData } from '@/lib/booking/load-booking-data';
import { loadGuestAppointment } from '@/lib/booking/load-guest-appointment';
import { ROUTES } from '@/lib/routes';
import { RescheduleFlow } from './reschedule-flow';

// El token va en la URL: no se indexa, no se cachea y no se envía a terceros (ADR-0018).
export const metadata: Metadata = {
  title: 'Cambiar tu cita',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

const LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-6 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';

function Notice({ title, children, token }: { title: string; children: string; token?: string }) {
  return (
    <section className="mx-auto w-full max-w-3xl px-(--layout-gutter) py-12 sm:py-16">
      <h1 className="font-display text-display font-semibold">{title}</h1>
      <p className="mt-3 max-w-prose text-fg-muted">{children}</p>
      <div className="mt-8 flex flex-wrap gap-2">
        {token ? (
          <Link href={`${ROUTES.cita}/${token}`} className={LINK_CLASS}>
            Volver a mi cita
          </Link>
        ) : null}
        <Link href={ROUTES.contacto} className={LINK_CLASS}>
          Contacto
        </Link>
      </div>
    </section>
  );
}

export default async function CambiarCitaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const appointment = await loadGuestAppointment(token);

  // Mismo mensaje para enlace inexistente, manipulado o caducado (ADR-0009).
  if (!appointment) {
    return (
      <Notice title="Enlace no válido o caducado">
        Este enlace no existe, está incompleto o ya ha caducado. Si necesitas ayuda con tu cita,
        consulta nuestro contacto.
      </Notice>
    );
  }

  if (appointment.status !== 'confirmed' && appointment.status !== 'pending') {
    return (
      <Notice title="Esta cita no se puede cambiar" token={token}>
        Esta cita ya no está activa. Si quieres otra, puedes reservarla de nuevo.
      </Notice>
    );
  }

  if (!appointment.canChange) {
    return (
      <Notice title="Ya no se puede cambiar desde aquí" token={token}>
        Faltan menos de 24 horas para tu cita y ya no se puede cancelar ni cambiar desde aquí.
        Contacta con el salón.
      </Notice>
    );
  }

  const data = await loadBookingData();
  const offeredIds = data?.offers[appointment.serviceId] ?? [];
  const stylists = data?.stylists.filter((s) => offeredIds.includes(s.id)) ?? [];
  if (!data || stylists.length === 0) {
    return (
      <Notice title="No podemos cambiar tu cita ahora" token={token}>
        No hemos podido cargar los horarios. Inténtalo de nuevo en unos minutos o consulta nuestro
        contacto.
      </Notice>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-(--layout-gutter) py-12 sm:py-16">
      <h1 className="font-display text-display font-semibold">Cambiar tu cita</h1>
      <p className="mt-3 max-w-prose text-fg-muted">
        Elige otra estilista, día u hora para el mismo servicio. Las horas son las libres ahora mismo.
      </p>

      <noscript>
        <p className="mt-6 border-y border-border-strong py-4">
          Para cambiar la cita necesitas activar JavaScript. Mientras tanto puedes llamarnos desde{' '}
          <Link href={ROUTES.contacto} className="text-accent-text">
            Contacto
          </Link>
          .
        </p>
      </noscript>

      <div className="mt-10">
        <RescheduleFlow
          token={token}
          serviceId={appointment.serviceId}
          serviceName={appointment.serviceName}
          current={{
            stylistId: appointment.stylistId,
            stylistName: appointment.stylistName,
            startsAt: appointment.startsAt,
          }}
          stylists={stylists}
          today={todayInMadrid()}
        />
      </div>
    </section>
  );
}
