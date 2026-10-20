import type { Metadata } from 'next';
import Link from 'next/link';
import { TokenSchema } from '@/lib/booking/token';
import { formatLongDate, formatSlotTime, madridDateOf } from '@/lib/booking/dates';
import { STATUS_LABELS } from '@/lib/booking/status';
import { ROUTES } from '@/lib/routes';
import { formatPriceFrom } from '@/lib/services/catalog';
import { createPublicClient } from '@/lib/supabase/public-client';
import { CancelAppointment } from './cancel-appointment';

// El token va en la URL: no se indexa, no se cachea y no se envía a terceros en la cabecera Referer
// (ADR-0018).
export const metadata: Metadata = {
  title: 'Tu cita',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

// Margen mínimo para cancelar desde el enlace (RF-05). La BD lo vuelve a comprobar.
const CANCEL_WINDOW_MS = 24 * 60 * 60_000;

const LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-6 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';

type Appointment = {
  serviceName: string;
  priceFromCents: number | null;
  stylistName: string;
  startsAt: string;
  status: keyof typeof STATUS_LABELS;
  canCancel: boolean;
};

// Consulta con la clave anónima y la función pública de la BD. Cualquier fallo (forma incorrecta,
// desconocido, manipulado o caducado) da el MISMO resultado: no revela si la cita existe (ADR-0009).
async function loadAppointment(rawToken: string): Promise<Appointment | null> {
  const token = TokenSchema.safeParse(rawToken);
  if (!token.success) return null;

  const client = createPublicClient();
  if (!client) return null;

  const { data, error } = await client.rpc('get_guest_appointment', { p_token: token.data });
  const row = data?.[0];
  if (error || !row) return null;

  const [service, stylist] = await Promise.all([
    client.from('services').select('name, price_from_cents').eq('id', row.service_id).maybeSingle(),
    client.from('stylists').select('name').eq('id', row.stylist_id).maybeSingle(),
  ]);

  return {
    serviceName: service.data?.name ?? 'Servicio',
    priceFromCents: service.data?.price_from_cents ?? null,
    stylistName: stylist.data?.name ?? 'Estilista',
    startsAt: row.starts_at,
    status: row.status,
    canCancel: new Date(row.starts_at).getTime() - Date.now() >= CANCEL_WINDOW_MS,
  };
}

export default async function CitaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const appointment = await loadAppointment(token);

  if (!appointment) {
    return (
      <section className="mx-auto w-full max-w-3xl px-(--layout-gutter) py-12 sm:py-16">
        <h1 className="font-display text-display font-semibold">Enlace no válido o caducado</h1>
        <p className="mt-3 max-w-prose text-fg-muted">
          Este enlace no existe, está incompleto o ya ha caducado. Si necesitas ayuda con tu cita,
          consulta nuestro contacto.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <Link href={ROUTES.contacto} className={LINK_CLASS}>
            Contacto
          </Link>
          <Link href={ROUTES.reservar} className={LINK_CLASS}>
            Reservar una cita
          </Link>
        </div>
      </section>
    );
  }

  const isActive = appointment.status === 'confirmed' || appointment.status === 'pending';

  return (
    <section className="mx-auto w-full max-w-3xl px-(--layout-gutter) py-12 sm:py-16">
      <h1 className="font-display text-display font-semibold">Tu cita</h1>
      <p className="mt-3 text-fg-muted">Estos son los datos de tu cita.</p>

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
        appointment.canCancel ? (
          <CancelAppointment token={token} />
        ) : (
          <p className="mt-8 rounded-card bg-accent-soft p-4 text-fg">
            Faltan menos de 24 horas para tu cita y ya no se puede cancelar ni cambiar desde aquí.
            Contacta con el salón.
          </p>
        )
      ) : null}

      <div className="mt-8 flex flex-wrap gap-2">
        {appointment.status === 'cancelled' ? (
          <Link href={ROUTES.reservar} className={LINK_CLASS}>
            Reservar otra cita
          </Link>
        ) : null}
        <Link href={ROUTES.home} className={LINK_CLASS}>
          Volver al inicio
        </Link>
        <Link href={ROUTES.contacto} className={LINK_CLASS}>
          Contacto
        </Link>
      </div>
    </section>
  );
}
