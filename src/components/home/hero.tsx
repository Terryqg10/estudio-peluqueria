import { DemoSection } from '@/components/demo/demo-section';
import { SITE } from '@/lib/site';

// Hero de la carta de color (RF-01, CA-03; ADR-0040, T-041). La carta de muestras es la imagen: ocho mechones colgados de un anillo
// que el visitante abre con el cursor. Texto primero en el DOM; el abanico es decoración (aria-hidden), la información está en la
// carta de servicios. «Probar el panel» (RF-13) es la acción principal para quien evalúa el proyecto.
const SWATCHES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

// «Ver servicios» es secundario: el cobre del primer viewport es solo de «Probar el panel» (jerarquía de la acción, T-041).
const SECONDARY_CLASS =
  'inline-flex min-h-11 items-center rounded-control border border-border-strong px-6 font-semibold text-fg transition-[background-color,scale] duration-(--duration-fast) ease-(--ease-soft) hover:bg-surface-muted active:scale-(--press-scale)';

export function Hero() {
  return (
    <section
      aria-labelledby="hero-titulo"
      className="mx-auto grid w-full max-w-6xl items-center gap-10 px-(--layout-gutter) py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8 lg:py-12"
    >
      <div>
        <h1 id="hero-titulo" className="font-display text-display font-semibold tracking-tight">
          Elige tu servicio, mira el precio, reserva tu hueco
        </h1>
        <p className="mt-6 max-w-prose text-lg leading-relaxed text-fg-muted">
          Precios claros y reserva online con la disponibilidad real de cada estilista. {SITE.tagline}.
        </p>
        <DemoSection />
        <p className="mt-6">
          <a href="#servicios" className={SECONDARY_CLASS}>
            Ver servicios
          </a>
        </p>
      </div>

      <div aria-hidden="true" className="swatch-fan xl:-mr-16" data-allow-overflow>
        <span className="swatch-fan__ring" />
        <ul className="m-0 list-none p-0">
          {SWATCHES.map((n, i) => (
            <li key={n} className="swatch-fan__item" style={{ ['--i' as string]: i }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG propio, decorativo, con tamaño reservado */}
              <img src={`/images/carta/muestra-${n}.svg`} alt="" width={120} height={440} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
