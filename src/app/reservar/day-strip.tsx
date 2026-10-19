'use client';

import { MAX_DAYS_AHEAD, buildDays, formatDayParts } from '@/lib/booking/dates';

type Props = {
  today: string;
  selected: string;
  visibleCount: number;
  onSelect: (date: string) => void;
  onShowMore: () => void;
};

const STEP = 14;

// Tira de días con desplazamiento horizontal controlado (carrusel permitido por la regla
// de responsive). Arranca con 14 días y se amplía de 14 en 14 hasta la ventana de reserva.
export function DayStrip({ today, selected, visibleCount, onSelect, onShowMore }: Props) {
  const days = buildDays(today, Math.min(visibleCount, MAX_DAYS_AHEAD));
  const canShowMore = visibleCount < MAX_DAYS_AHEAD;

  return (
    <div>
      <div data-allow-overflow className="overflow-x-auto pb-2">
        <ul className="flex gap-2">
          {days.map((date) => {
            const { weekday, day, month } = formatDayParts(date);
            const isSelected = date === selected;
            return (
              <li key={date}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  data-date={date}
                  onClick={() => onSelect(date)}
                  className={`flex min-h-16 min-w-16 flex-col items-center justify-center rounded-card border px-2 py-2 transition-colors duration-(--duration-fast) ${
                    isSelected
                      ? 'border-accent bg-accent text-accent-fg'
                      : 'border-border-strong bg-surface text-fg hover:bg-surface-muted'
                  }`}
                >
                  <span className="text-sm capitalize">{weekday}</span>
                  <span className="text-xl font-semibold">{day}</span>
                  <span className="text-sm">{month}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {canShowMore ? (
        <button
          type="button"
          onClick={onShowMore}
          className="mt-2 inline-flex min-h-11 items-center rounded-control px-4 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft"
        >
          Más fechas
        </button>
      ) : null}
    </div>
  );
}

export const DAY_STRIP_STEP = STEP;
