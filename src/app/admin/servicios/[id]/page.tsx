import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requirePanel } from '@/lib/account/require-admin';
import { centsToEuros, countFutureAppointments, loadAdminServices } from '@/lib/admin/services';
import { ROUTES } from '@/lib/routes';
import { ReadOnlyScope } from '@/components/admin/read-only-scope';
import { ServiceForm } from '../service-form';

export const metadata: Metadata = { title: 'Servicio' };
export const dynamic = 'force-dynamic';

const LINK_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control px-4 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';

// `/admin/servicios/nuevo` crea; `/admin/servicios/<uuid>` edita.
export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePanel(); // un layout no basta (ADR-0022)
  const { id } = await params;
  const isNew = id === 'nuevo';
  if (!isNew && !z.string().uuid().safeParse(id).success) notFound();

  const result = await loadAdminServices(admin.client);
  if (result === 'error') {
    return (
      <section className="max-w-3xl">
        <h1 className="font-display text-display font-semibold">Servicio</h1>
        <p role="alert" className="mt-6 rounded-card bg-accent-soft p-4 text-fg">
          No hemos podido cargar el servicio. Inténtalo de nuevo en unos minutos.
        </p>
      </section>
    );
  }

  const service = isNew ? null : (result.services.find((s) => s.id === id) ?? null);
  if (!isNew && !service) notFound();

  const categories = [...new Set(result.services.map((s) => s.category))];
  const future = service ? await countFutureAppointments(admin.client, service.id) : null;

  return (
    <section className="max-w-3xl">
      <p className="-ml-4">
        <Link href={ROUTES.adminServicios} className={LINK_CLASS}>
          Volver a servicios
        </Link>
      </p>
      <h1 className="font-display text-display font-semibold">{service ? 'Editar servicio' : 'Nuevo servicio'}</h1>
      <ReadOnlyScope readOnly={admin.readOnly}>
      <ServiceForm
        id={service?.id ?? null}
        initial={{
          name: service?.name ?? '',
          category: service?.category ?? '',
          price: service ? centsToEuros(service.priceCents) : '',
          duration: service ? String(service.durationMin) : '60',
          active: service?.active ?? true,
          stylistIds: service?.stylistIds ?? [],
        }}
        stylists={result.stylists}
        categories={categories}
        futureAppointments={future}
      />
      </ReadOnlyScope>
    </section>
  );
}
