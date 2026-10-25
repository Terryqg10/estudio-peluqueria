import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePanel } from '@/lib/account/require-admin';
import { AdminTwoColumns, SummaryCard } from '@/components/admin/two-columns';
import { loadAdminServices } from '@/lib/admin/services';
import { ROUTES } from '@/lib/routes';
import { formatDuration, formatPriceFrom } from '@/lib/services/catalog';

export const metadata: Metadata = { title: 'Servicios' };
export const dynamic = 'force-dynamic';

const LINK_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control px-4 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';
const CTA_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover';

type SearchParams = Promise<{ aviso?: string }>;

export default async function ServicesPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requirePanel(); // un layout no basta (ADR-0022)
  const { aviso } = await searchParams;
  const result = await loadAdminServices(admin.client);

  const active = result === 'error' ? 0 : result.services.filter((s) => s.active).length;
  const total = result === 'error' ? 0 : result.services.length;

  return (
    <AdminTwoColumns
      aside={
        result === 'error' ? null : (
          <SummaryCard
            title="Resumen"
            items={[
              { label: 'Servicios', value: String(total) },
              { label: 'Activos', value: String(active) },
              { label: 'Inactivos', value: String(total - active) },
            ]}
          />
        )
      }
    >
      <section className="max-w-3xl">
        <h1 className="font-display text-display font-semibold">Servicios</h1>

        {admin.readOnly ? null : (
          <p className="mt-6">
            <Link href={`${ROUTES.adminServicios}/nuevo`} className={CTA_CLASS}>
              Nuevo servicio
            </Link>
          </p>
        )}

        {aviso === 'guardado' ? (
          <p role="status" className="mt-4 rounded-card bg-accent-soft p-4 font-semibold text-fg">
            Servicio guardado.
          </p>
        ) : null}

        {result === 'error' ? (
          <div role="alert" className="mt-6 rounded-card bg-accent-soft p-4 text-fg">
            <p>No hemos podido cargar los servicios.</p>
            <Link href={ROUTES.adminServicios} className={`${LINK_CLASS} mt-2`}>
              Reintentar
            </Link>
          </div>
        ) : result.services.length === 0 ? (
          <p className="mt-6 rounded-container bg-surface p-6 text-fg-muted shadow-card">Todavía no hay servicios.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {result.services.map((s) => (
              <li key={s.id} data-service-id={s.id} className="rounded-container bg-surface p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-fg-muted">
                      {s.category} · {formatPriceFrom(s.priceCents)} · {formatDuration(s.durationMin)}
                    </p>
                    <p className="mt-1 text-fg-muted">
                      {s.active ? 'Activo' : 'Inactivo'} ·{' '}
                      {s.stylistIds.length === 0
                        ? 'Sin estilistas'
                        : result.stylists
                            .filter((st) => s.stylistIds.includes(st.id))
                            .map((st) => st.name)
                            .join(', ') || 'Sin estilistas activas'}
                    </p>
                  </div>
                  <Link
                    href={`${ROUTES.adminServicios}/${s.id}`}
                    aria-label={`Editar ${s.name}`}
                    className={LINK_CLASS}
                  >
                    Editar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminTwoColumns>
  );
}
