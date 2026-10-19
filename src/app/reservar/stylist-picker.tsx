'use client';

import type { StylistOption } from '@/lib/booking/types';

type Props = {
  stylists: readonly StylistOption[];
  selectedId: string; // 'any' o el id de una estilista
  onSelect: (id: string) => void;
};

const OPTION_CLASS =
  'flex min-h-11 cursor-pointer flex-col gap-1 rounded-card border border-border-strong bg-surface p-4 transition-colors duration-(--duration-fast) hover:bg-surface-muted has-checked:border-accent has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent';

// Segundo paso: estilista. «Cualquiera disponible» es la opción por defecto.
export function StylistPicker({ stylists, selectedId, onSelect }: Props) {
  return (
    <fieldset>
      <legend className="font-display text-2xl font-semibold">Elige estilista</legend>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li>
          <label className={OPTION_CLASS}>
            <input
              type="radio"
              name="estilista"
              value="any"
              checked={selectedId === 'any'}
              onChange={() => onSelect('any')}
              className="sr-only"
            />
            <span className="font-semibold">Cualquiera disponible</span>
            <span className="text-fg-muted">Más horas para elegir</span>
          </label>
        </li>
        {stylists.map((stylist) => (
          <li key={stylist.id}>
            <label className={OPTION_CLASS}>
              <input
                type="radio"
                name="estilista"
                value={stylist.id}
                checked={selectedId === stylist.id}
                onChange={() => onSelect(stylist.id)}
                className="sr-only"
              />
              <span className="font-semibold">{stylist.name}</span>
              {stylist.specialty ? <span className="text-fg-muted">{stylist.specialty}</span> : null}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
