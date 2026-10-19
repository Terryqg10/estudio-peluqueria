'use client';

import { splitByPartOfDay, type TimeOption } from '@/lib/booking/slots';

type Props = {
  options: readonly TimeOption[];
  selectedStart: string | null;
  onSelect: (option: TimeOption) => void;
};

// Rejilla de horas, repartida en mañana y tarde. Cada botón lleva su instante en `data-starts-at`.
export function SlotGrid({ options, selectedStart, onSelect }: Props) {
  const parts = splitByPartOfDay(options);
  const groups = [
    { id: 'morning', title: 'Mañana', items: parts.morning },
    { id: 'afternoon', title: 'Tarde', items: parts.afternoon },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.id}>
          <h4 className="text-lg font-semibold">{group.title}</h4>
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {group.items.map((option) => {
              const isSelected = option.startsAt === selectedStart;
              return (
                <li key={option.startsAt}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    data-starts-at={option.startsAt}
                    onClick={() => onSelect(option)}
                    className={`inline-flex min-h-11 w-full items-center justify-center rounded-control border px-3 transition-colors duration-(--duration-fast) ${
                      isSelected
                        ? 'border-accent bg-accent text-accent-fg'
                        : 'border-border-strong bg-surface text-fg hover:bg-surface-muted'
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
