import Image from 'next/image';
import { SITE } from '@/lib/site';

// Hero (RF-01, CA-03). Imagen primero en el DOM: en móvil va arriba y el texto abajo
// (v1); en escritorio, dos columnas. Es la imagen LCP, la única con prioridad alta.
export function Hero() {
  return (
    <section
      aria-labelledby="hero-titulo"
      className="mx-auto grid w-full max-w-6xl items-center gap-8 px-(--layout-gutter) py-8 lg:grid-cols-2 lg:gap-12 lg:py-16"
    >
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-container bg-surface-muted">
        <Image
          src="/images/hero-inicio.jpg"
          alt="Una mujer sonríe en el salón con una pinza sujetándole el cabello rizado"
          width={2000}
          height={1333}
          sizes="(min-width: 1024px) 50vw, 100vw"
          fetchPriority="high"
          loading="eager"
          className="size-full object-cover object-center"
        />
      </div>

      <div>
        <p className="text-accent-text">{SITE.tagline}</p>
        <h1
          id="hero-titulo"
          className="mt-3 font-display text-display font-semibold tracking-tight"
        >
          Tu cabello, en las mejores manos
        </h1>
        <p className="mt-6 max-w-prose text-lg leading-relaxed text-fg-muted">
          Precios claros y reserva online con la disponibilidad real de cada estilista.
        </p>
        <a
          href="#servicios"
          className="mt-8 inline-flex min-h-11 items-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-[background-color,scale] duration-(--duration-fast) ease-(--ease-soft) hover:bg-accent-hover active:scale-(--press-scale)"
        >
          Ver servicios
        </a>
      </div>
    </section>
  );
}
