'use client';

import type { StylistOption } from '@/lib/booking/types';

type Props = {
  stylists: readonly StylistOption[];
  selectedId: string; // 'any' o el id de una estilista
  onSelect: (id: string) => void;
};

const OPTION_CLASS =
  'inline-flex min-h-11 cursor-pointer items-center rounded-control border border-border-strong bg-surface px-4 transition-colors duration-(--duration-fast) ease-(--ease-soft) hover:bg-surface-muted has-checked:border-fg has-checked:bg-fg has-checked:text-bg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent';

// Filtro de estilista (T-042): la estilista se elige al pulsar su hora en su fila; estos botones solo acotan la jornada a una sola.
// «Todas» (antes «Cualquiera disponible») muestra la jornada de cada estilista que hace el servicio.
export function StylistPicker({ stylists, selectedId, onSelect }: Props) {
  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="sr-only">Estilista</legend>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
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
            <span className="font-semibold">Todas</span>
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
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
