import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { formatDuration, formatPriceFrom, type CatalogResult } from '@/lib/services/catalog';

// Servicios (RF-01, CA-01 parcial): categoría, precio «desde» y duración.
// El botón «Reservar» por servicio llega con T-005, cuando exista /reservar.
export function ServicesSection({ catalog }: { catalog: CatalogResult }) {
  return (
    <section
      id="servicios"
      aria-labelledby="servicios-titulo"
      className="mx-auto w-full max-w-6xl scroll-mt-24 px-(--layout-gutter) py-12 sm:py-16"
    >
      <h2 id="servicios-titulo" className="font-display text-3xl font-semibold">
        Servicios y precios
      </h2>
      <p className="mt-2 max-w-prose text-fg-muted">
        Precios orientativos «desde» y duración estimada de cada servicio.
      </p>

      {!catalog.ok ? (
        <div role="alert" className="mt-8 rounded-card bg-surface p-6 shadow-card">
          <p className="font-semibold">No hemos podido cargar los servicios.</p>
          <p className="mt-1 text-fg-muted">
            Inténtalo de nuevo en unos minutos o consulta nuestros datos de contacto.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={ROUTES.home}
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
      ) : catalog.groups.length === 0 ? (
        <div className="mt-8 rounded-card bg-surface p-6 shadow-card">
          <p className="font-semibold">Aún no hay servicios disponibles.</p>
          <Link
            href={ROUTES.contacto}
            className="mt-3 inline-flex min-h-11 items-center text-accent-text transition-colors duration-(--duration-fast) hover:text-accent-hover"
          >
            Consulta nuestro contacto
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {catalog.groups.map((group) => (
            <div key={group.category}>
              <h3 className="text-xl font-semibold">{group.category}</h3>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.services.map((service) => (
                  <li key={service.id} className="rounded-card bg-surface p-5 shadow-card">
                    <h4 className="text-lg font-semibold">{service.name}</h4>
                    <p className="mt-1 text-fg-muted">{formatDuration(service.duration_min)}</p>
                    <p className="mt-3 text-lg font-semibold text-accent-text">
                      {formatPriceFrom(service.price_from_cents)}
                    </p>
                    <Link
                      href={{ pathname: ROUTES.reservar, query: { servicio: service.id } }}
                      aria-label={`Reservar ${service.name}`}
                      className="mt-4 inline-flex min-h-11 items-center rounded-control bg-accent px-5 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover"
                    >
                      Reservar
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
