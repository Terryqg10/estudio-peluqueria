import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { getBookingAccount } from '@/lib/booking/booking-account';
import { todayInMadrid } from '@/lib/booking/dates';
import { loadBookingData } from '@/lib/booking/load-booking-data';
import { ROUTES } from '@/lib/routes';
import { BookingFlow } from './booking-flow';

export const metadata: Metadata = {
  title: 'Reservar cita',
  description: 'Elige servicio, estilista, día y hora con la disponibilidad real del salón.',
};

// La disponibilidad cambia en cada petición.
export const dynamic = 'force-dynamic';

const SearchSchema = z.object({ servicio: z.string().uuid().optional() });

export default async function ReservarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = SearchSchema.safeParse({
    servicio: typeof raw.servicio === 'string' ? raw.servicio : undefined,
  });
  const [data, account] = await Promise.all([loadBookingData(), getBookingAccount()]);

  // Un `?servicio=` inexistente o mal formado se ignora (entrada externa, RNF-02).
  const initialServiceId =
    parsed.success && parsed.data.servicio && data?.services.some((s) => s.id === parsed.data.servicio)
      ? parsed.data.servicio
      : null;

  return (
    <section className="mx-auto w-full max-w-6xl px-(--layout-gutter) py-12 sm:py-16">
      <h1 className="font-display text-display font-semibold">Reserva tu cita</h1>
      <p className="mt-3 max-w-prose text-fg-muted">
        Elige servicio, estilista, día y hora. Las horas son las libres ahora mismo.
      </p>

      <noscript>
        <p className="mt-6 rounded-card bg-surface p-5 shadow-card">
          Para reservar necesitas activar JavaScript. Mientras tanto puedes llamarnos desde{' '}
          <Link href={ROUTES.contacto} className="text-accent-text">
            Contacto
          </Link>
          .
        </p>
      </noscript>

      <div className="mt-10">
        {data ? (
          <BookingFlow
            data={data}
            today={todayInMadrid()}
            initialServiceId={initialServiceId}
            account={account ? { email: account.email, name: account.name, phone: account.phone } : null}
          />
        ) : (
          <div role="alert" className="rounded-card bg-surface p-6 shadow-card">
            <p className="font-semibold">No hemos podido cargar los servicios.</p>
            <p className="mt-1 text-fg-muted">
              Inténtalo de nuevo en unos minutos o consulta nuestros datos de contacto.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={ROUTES.reservar}
                className="inline-flex min-h-11 items-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover"
              >
                Reintentar
              </a>
              <Link
                href={ROUTES.contacto}
                className="inline-flex min-h-11 items-center rounded-control px-6 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft"
              >
                Contacto
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
