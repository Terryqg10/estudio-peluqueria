import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { formatDuration, formatPriceFrom, type CatalogResult } from '@/lib/services/catalog';

// La carta de servicios (RF-01, CA-01 parcial; ADR-0040, T-041): cada servicio es una fila de la carta con su muestra tumbada (pinza a la
// izquierda con el número impreso), nombre, duración y precio «desde» alineado a la derecha. El número es el orden de la carta (no un
// nivel de color real) y las muestras se reparten por posición. Sin tarjetas: líneas de separación.
const SWATCH_COUNT = 8;

// El cobre es de la acción principal de la Home («Probar el panel»); «Reservar» es secundario.
const SECONDARY_CLASS =
  'inline-flex min-h-11 items-center rounded-control border border-border-strong px-5 font-semibold text-fg transition-[background-color,scale] duration-(--duration-fast) ease-(--ease-soft) hover:bg-surface-muted active:scale-(--press-scale)';
const LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-6 text-accent-text transition-colors duration-(--duration-fast) ease-(--ease-soft) hover:bg-accent-soft';

export function ServicesSection({ catalog }: { catalog: CatalogResult }) {
  // Orden de la carta: el de aparición del catálogo (la BD ya ordena por sort_order).
  const order = catalog.ok ? catalog.groups.flatMap((group) => group.services.map((service) => service.id)) : [];

  return (
    <section
      id="servicios"
      aria-labelledby="servicios-titulo"
      className="mx-auto w-full max-w-6xl scroll-mt-24 px-(--layout-gutter) py-12 sm:py-16"
    >
      <h2 id="servicios-titulo" className="font-display text-3xl font-semibold tracking-tight leading-tight">
        Servicios y precios
      </h2>
      <p className="mt-2 max-w-prose leading-relaxed text-fg-muted">
        Precios orientativos «desde» y duración estimada de cada servicio.
      </p>

      {!catalog.ok ? (
        <div role="alert" className="mt-8 border-y border-border-strong py-6">
          <p className="font-semibold">No hemos podido cargar los servicios.</p>
          <p className="mt-1 leading-relaxed text-fg-muted">
            Inténtalo de nuevo en unos minutos o consulta nuestros datos de contacto.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={ROUTES.home} className={SECONDARY_CLASS}>
              Reintentar
            </a>
            <Link href={ROUTES.contacto} className={LINK_CLASS}>
              Contacto
            </Link>
          </div>
        </div>
      ) : catalog.groups.length === 0 ? (
        <div className="mt-8 border-y border-border-strong py-6">
          <p className="font-semibold">Aún no hay servicios disponibles.</p>
          <Link
            href={ROUTES.contacto}
            className="mt-3 inline-flex min-h-11 items-center text-accent-text transition-colors duration-(--duration-fast) ease-(--ease-soft) hover:text-accent-hover"
          >
            Consulta nuestro contacto
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {catalog.groups.map((group) => (
            <div key={group.category}>
              <h3 className="border-b border-border-strong pb-2 text-xl font-semibold tracking-tight leading-tight">
                {group.category}
              </h3>
              <ul className="m-0 list-none p-0">
                {group.services.map((service) => {
                  const position = order.indexOf(service.id);
                  const number = String(position + 1).padStart(2, '0');
                  const swatch = (position % SWATCH_COUNT) + 1;
                  return (
                    <li
                      key={service.id}
                      className="group grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 border-b border-border py-5 sm:grid-cols-[13rem_minmax(0,1fr)_auto_auto] sm:gap-x-6"
                    >
                      <div className="relative row-span-2 transition-transform duration-(--duration-base) ease-(--ease-soft) group-hover:translate-x-(--swatch-slide) sm:row-span-1">
                        {/* eslint-disable-next-line @next/next/no-img-element -- SVG propio, decorativo, con tamaño reservado */}
                        <img
                          src={`/images/carta/muestra-${swatch}-h.svg`}
                          alt=""
                          width={440}
                          height={120}
                          className="block h-auto w-full"
                        />
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-1/4 flex h-1/2 w-[13.5%] items-center justify-center text-xs font-semibold tabular-nums text-bg"
                        >
                          {number}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-lg font-semibold tracking-tight leading-tight">{service.name}</h4>
                        <p className="mt-1 text-fg-muted">{formatDuration(service.duration_min)}</p>
                      </div>
                      <p className="text-lg font-semibold tabular-nums sm:text-right">
                        {formatPriceFrom(service.price_from_cents)}
                      </p>
                      <Link
                        href={{ pathname: ROUTES.reservar, query: { servicio: service.id } }}
                        aria-label={`Reservar ${service.name}`}
                        className={`col-span-2 justify-self-start sm:col-span-1 ${SECONDARY_CLASS}`}
                      >
                        Reservar
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
