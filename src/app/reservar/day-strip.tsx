'use client';

import { useState } from 'react';
import { MAX_DAYS_AHEAD, addDays, daysBetween, formatDayParts } from '@/lib/booking/dates';

type Props = {
  today: string;
  selected: string;
  onSelect: (date: string) => void;
};

export const DAYS_PER_PAGE = 7;
const PAGES = Math.ceil(MAX_DAYS_AHEAD / DAYS_PER_PAGE);

function pageOf(today: string, date: string): number {
  const index = Math.floor(daysBetween(today, date) / DAYS_PER_PAGE);
  return Math.min(PAGES - 1, Math.max(0, index));
}

const ARROW_CLASS =
  'inline-flex size-11 items-center justify-center rounded-full border border-border text-fg-muted transition-colors duration-(--duration-fast) hover:bg-surface-muted disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent';

// Tira de una semana (7 días) con flechas para pasar a la siguiente, hasta la ventana de reserva (60 días).
// Es un carrusel horizontal: en pantallas muy estrechas la semana se desplaza dentro de su contenedor.
export function DayStrip({ today, selected, onSelect }: Props) {
  const [page, setPage] = useState(() => pageOf(today, selected));
  const [seenSelected, setSeenSelected] = useState(selected);

  // Si el día elegido cambia desde fuera (p. ej. «Ver otros días»), la tira salta a su semana.
  let current = page;
  if (selected !== seenSelected) {
    current = pageOf(today, selected);
    setSeenSelected(selected);
    setPage(current);
  }

  const first = addDays(today, current * DAYS_PER_PAGE);
  const days = Array.from({ length: DAYS_PER_PAGE }, (_, i) => addDays(first, i)).filter(
    (date) => daysBetween(today, date) < MAX_DAYS_AHEAD,
  );
  const start = formatDayParts(days[0] ?? first);
  const end = formatDayParts(days[days.length - 1] ?? first);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Semana anterior"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
          className={ARROW_CLASS}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <p className="text-fg-muted" aria-live="polite">
          {start.day} {start.month} – {end.day} {end.month}
        </p>
        <button
          type="button"
          aria-label="Semana siguiente"
          disabled={current >= PAGES - 1}
          onClick={() => setPage(current + 1)}
          className={ARROW_CLASS}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div data-allow-overflow className="relative mt-4 overflow-x-auto pb-2">
        <ul className="flex gap-2">
          {days.map((date) => {
            const { weekday, day, month } = formatDayParts(date);
            const isSelected = date === selected;
            return (
              <li key={date} className="min-w-12 flex-1">
                <button
                  type="button"
                  aria-pressed={isSelected}
                  data-date={date}
                  onClick={() => onSelect(date)}
                  className={`flex min-h-16 w-full flex-col items-center justify-center rounded-card border px-2 py-2 transition-colors duration-(--duration-fast) ${
                    isSelected
                      ? 'border-accent bg-accent text-accent-fg'
                      : 'border-border bg-transparent text-fg hover:bg-surface-muted'
                  }`}
                >
                  <span className="text-sm capitalize">{weekday}</span>
                  <span className="text-xl font-semibold">{day}</span>
                  <span className="sr-only">{month}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
