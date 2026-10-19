'use client';

import { formatDuration, formatPriceFrom } from '@/lib/services/catalog';
import type { ServiceOption } from '@/lib/booking/types';

type Props = {
  services: readonly ServiceOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

// Primer paso (CA-05): elegir servicio. Radios nativos agrupados por categoría.
export function ServicePicker({ services, selectedId, onSelect }: Props) {
  const categories = [...new Set(services.map((s) => s.category))];

  return (
    <fieldset className="space-y-8">
      <legend className="font-display text-2xl font-semibold">Elige tu servicio</legend>
      {categories.map((category) => (
        <div key={category}>
          <p className="text-lg font-semibold">{category}</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {services
              .filter((s) => s.category === category)
              .map((service) => (
                <li key={service.id}>
                  <label className="flex min-h-11 cursor-pointer flex-col gap-1 rounded-card border border-border-strong bg-surface p-4 transition-colors duration-(--duration-fast) hover:bg-surface-muted has-checked:border-accent has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent">
                    <input
                      type="radio"
                      name="servicio"
                      value={service.id}
                      checked={selectedId === service.id}
                      onChange={() => onSelect(service.id)}
                      className="sr-only"
                    />
                    <span className="font-semibold">{service.name}</span>
                    <span className="text-fg-muted">{formatDuration(service.durationMin)}</span>
                    <span className="font-semibold text-accent-text">
                      {formatPriceFrom(service.priceFromCents)}
                    </span>
                  </label>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </fieldset>
  );
}
