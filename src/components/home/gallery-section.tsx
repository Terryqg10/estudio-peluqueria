import Image from 'next/image';
import Link from 'next/link';
import { filterByTechnique, techniquesOf, type GalleryResult } from '@/lib/gallery/gallery';
import { ROUTES } from '@/lib/routes';

type Props = {
  gallery: GalleryResult;
  selected: string | null; // técnica elegida con `?tecnica=` (ya validada) o null = todas
};

const CHIP_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control border px-5 transition-colors duration-(--duration-fast) ease-(--ease-soft)';

// Los filtros son enlaces (`/?tecnica=…#galeria`): funcionan sin JavaScript y se pueden compartir.
function chipHref(technique: string | null): string {
  return technique === null
    ? `${ROUTES.home}#galeria`
    : `${ROUTES.home}?tecnica=${encodeURIComponent(technique)}#galeria`;
}

// Galería antes/después (RF-01, CA-02): filtrable por técnica; cada trabajo indica técnica y estilista y enlaza a
// reservar ese servicio. El par se apila en móvil y va en columnas desde md (PLAN-001, 5a).
export function GallerySection({ gallery, selected }: Props) {
  const items = gallery.ok ? gallery.items : [];
  const techniques = techniquesOf(items);
  const visible = filterByTechnique(items, selected);

  return (
    <section
      id="galeria"
      aria-labelledby="galeria-titulo"
      className="mx-auto w-full max-w-6xl scroll-mt-24 px-(--layout-gutter) py-12 sm:py-16"
    >
      <h2 id="galeria-titulo" className="font-display text-3xl font-semibold tracking-tight leading-tight">
        Nuestros trabajos
      </h2>
      <p className="mt-2 max-w-prose leading-relaxed text-fg-muted">Antes y después de algunos de nuestros servicios.</p>

      {!gallery.ok ? (
        <div role="alert" className="mt-8 rounded-card bg-surface p-6 shadow-card">
          <p className="font-semibold">No hemos podido cargar la galería.</p>
          <p className="mt-1 text-fg-muted">Inténtalo de nuevo en unos minutos.</p>
          <div className="mt-4">
            <a
              href={`${ROUTES.home}#galeria`}
              className="inline-flex min-h-11 items-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-[background-color,scale] duration-(--duration-fast) ease-(--ease-soft) hover:bg-accent-hover active:scale-(--press-scale)"
            >
              Reintentar
            </a>
          </div>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-8 rounded-card bg-surface p-6 text-fg-muted shadow-card">Pronto añadiremos trabajos.</p>
      ) : (
        <>
          <nav aria-label="Filtrar la galería por técnica" className="mt-6">
            <ul className="flex flex-wrap gap-2">
              {[null, ...techniques].map((technique) => {
                const isSelected = technique === selected;
                return (
                  <li key={technique ?? 'todas'}>
                    <Link
                      href={chipHref(technique)}
                      scroll={false}
                      aria-current={isSelected ? 'true' : undefined}
                      data-technique-filter={technique ?? 'todas'}
                      className={`${CHIP_CLASS} ${
                        isSelected
                          ? 'border-accent bg-accent text-accent-fg'
                          : 'border-border bg-surface text-fg hover:bg-surface-muted'
                      }`}
                    >
                      {technique ?? 'Todas'}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Carta de trabajos (T-041, ADR-0040): en escritorio, una fila por trabajo (texto a la izquierda, antes y después a la derecha),
              sin tarjetas ni rejilla, así que no queda ninguno huérfano; en móvil, tira con scroll-snap (desbordamiento deliberado). */}
          <div
            role="region"
            aria-label="Trabajos antes y después"
            tabIndex={0}
            data-allow-overflow
            className="mt-8 overflow-x-auto md:overflow-visible"
          >
            <ul className="m-0 flex list-none snap-x snap-mandatory gap-4 p-0 md:block">
              {visible.map((item) => (
                <li
                  key={item.id}
                  data-gallery-item
                  data-technique={item.technique}
                  className="shrink-0 basis-5/6 snap-center rounded-card border border-border bg-surface p-4 md:border-0 md:border-b md:bg-transparent md:px-0 md:py-6 md:first:border-t"
                >
                  <article className="group md:grid md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-8">
                    <div className="md:col-start-1 md:row-start-1">
                      <h3 className="font-display text-2xl font-semibold tracking-tight leading-tight">{item.technique}</h3>
                      <p className="text-fg-muted">Con {item.stylistName}</p>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0 md:w-(--layout-pair-width)">
                      {[
                        {
                          label: 'Antes',
                          src: item.beforePath,
                          alt: item.altBefore,
                        },
                        {
                          label: 'Después',
                          src: item.afterPath,
                          alt: item.altAfter,
                        },
                      ].map((photo) => (
                        <figure key={photo.label}>
                          <Image
                            src={photo.src}
                            alt={photo.alt}
                            width={1000}
                            height={1000}
                            sizes="(min-width: 768px) 208px, 40vw"
                            className="h-auto w-full rounded-card"
                          />
                          <figcaption className="mt-1 text-fg-muted">{photo.label}</figcaption>
                        </figure>
                      ))}
                    </div>

                    <div className="mt-4 md:col-start-1 md:row-start-2 md:mt-0 md:self-end">
                      {item.aiGenerated ? <p className="text-fg-muted">Imagen generada con IA.</p> : null}
                      <Link
                        href={`${ROUTES.reservar}?servicio=${item.serviceId}`}
                        className="mt-3 inline-flex min-h-11 items-center rounded-control border border-border-strong px-6 font-semibold text-fg transition-[background-color,scale] duration-(--duration-fast) ease-(--ease-soft) hover:bg-surface-muted active:scale-(--press-scale)"
                      >
                        Reservar {item.serviceName}
                      </Link>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
