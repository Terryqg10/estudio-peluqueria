'use client';

import { splitByPartOfDay, type TimeOption } from '@/lib/booking/slots';

type Props = {
  options: readonly TimeOption[];
  selectedStart: string | null;
  onSelect: (option: TimeOption) => void;
};

// Rejilla de horas en tres columnas, repartida en mañana y tarde. Cada botón lleva su instante en
// `data-starts-at`. Las horas ya pasadas no llegan aquí: el servidor solo ofrece huecos a partir de
// «ahora + 2 h» (availability_core).
export function SlotGrid({ options, selectedStart, onSelect }: Props) {
  const parts = splitByPartOfDay(options);
  const groups = [
    { id: 'morning', title: 'Mañana', items: parts.morning },
    { id: 'afternoon', title: 'Tarde', items: parts.afternoon },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.id}>
          <h4 className="font-display text-2xl font-semibold">{group.title}</h4>
          <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {group.items.map((option) => {
              const isSelected = option.startsAt === selectedStart;
              return (
                <li key={option.startsAt}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    data-starts-at={option.startsAt}
                    onClick={() => onSelect(option)}
                    className={`inline-flex min-h-11 w-full items-center justify-center rounded-control border px-3 py-3 transition-colors duration-(--duration-fast) ${
                      isSelected
                        ? 'border-accent bg-accent text-accent-fg'
                        : 'border-border bg-surface text-fg hover:bg-surface-muted'
                    }`}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
