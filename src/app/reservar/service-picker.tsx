'use client';

import { formatDuration, formatPriceFrom } from '@/lib/services/catalog';
import type { ServiceOption } from '@/lib/booking/types';

type Props = {
  services: readonly ServiceOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const SWATCH_COUNT = 8;

// Primer paso (CA-05): elegir servicio. Radios nativos agrupados por categoría, en filas de la carta de color (T-042, ADR-0040):
// muestra tumbada con su número, nombre y duración, y el precio «desde» a la derecha. El número es el orden de la carta.
export function ServicePicker({ services, selectedId, onSelect }: Props) {
  const categories = [...new Set(services.map((s) => s.category))];

  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="font-display text-2xl font-semibold tracking-tight leading-tight">Elige tu servicio</legend>
      {categories.map((category) => (
        <div key={category} className="mt-6">
          <p className="border-b border-border-strong pb-2 text-lg font-semibold tracking-tight leading-tight">{category}</p>
          <ul className="m-0 list-none p-0">
            {services
              .filter((s) => s.category === category)
              .map((service) => {
                const position = services.findIndex((s) => s.id === service.id);
                const swatch = (position % SWATCH_COUNT) + 1;
                return (
                  <li key={service.id}>
                    <label className="group grid min-h-11 cursor-pointer grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-border px-2 py-3 transition-colors duration-(--duration-fast) ease-(--ease-soft) hover:bg-surface-muted has-checked:border-b-2 has-checked:border-b-accent has-checked:bg-surface has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
                      <input
                        type="radio"
                        name="servicio"
                        value={service.id}
                        checked={selectedId === service.id}
                        onChange={() => onSelect(service.id)}
                        className="sr-only"
                      />
                      <span className="relative block transition-transform duration-(--duration-base) ease-(--ease-soft) group-hover:translate-x-(--swatch-slide) group-has-checked:translate-x-(--swatch-slide)">
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
                          {String(position + 1).padStart(2, '0')}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold tracking-tight">{service.name}</span>
                        <span className="block text-fg-muted">{formatDuration(service.durationMin)}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold tabular-nums">{formatPriceFrom(service.priceFromCents)}</span>
                        <span className="hidden font-semibold text-accent-text group-has-checked:block">Elegido</span>
                      </span>
                    </label>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </fieldset>
  );
}
