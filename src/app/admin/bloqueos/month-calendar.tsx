'use client';

import { useState } from 'react';
import { addDays, daysBetween, formatLongDate } from '@/lib/booking/dates';

export type DateRange = { from: string | null; to: string | null };

type Props = {
  today: string;
  maxDaysAhead: number;
  mode: 'single' | 'range';
  value: DateRange;
  onChange: (value: DateRange) => void;
  label: string;
};

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const monthTitle = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', month: 'long', year: 'numeric' });

function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function addMonths(first: string, months: number): string {
  const [y, m] = first.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + months, 1)).toISOString().slice(0, 10);
}

// 0 = lunes … 6 = domingo
function weekdayIndex(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function daysInMonth(first: string): number {
  return daysBetween(first, addMonths(first, 1));
}

const ARROW_CLASS =
  'inline-flex size-11 items-center justify-center rounded-full border border-border text-fg-muted transition-colors duration-(--duration-fast) hover:bg-surface-muted disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent';

// Calendario mensual propio (sin `<input type="date">`): un día o un rango. Cada día es un botón con su fecha
// completa como nombre. En pantallas muy estrechas se desplaza dentro de su contenedor (carrusel).
export function MonthCalendar({ today, maxDaysAhead, mode, value, onChange, label }: Props) {
  const [month, setMonth] = useState(() => firstOfMonth(value.from ?? today));
  const lastDay = addDays(today, maxDaysAhead);
  const canPrev = month > firstOfMonth(today);
  const canNext = addMonths(month, 1) <= lastDay;

  const total = daysInMonth(month);
  const lead = weekdayIndex(month);
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => addDays(month, i)),
  ];

  function pick(date: string) {
    if (mode === 'single') return onChange({ from: date, to: date });
    const { from, to } = value;
    // Sin inicio, o ya hay un rango completo: se empieza uno nuevo. Con solo el inicio, el segundo clic cierra.
    if (!from || (to && to !== from)) return onChange({ from: date, to: date });
    if (date < from) return onChange({ from: date, to: from });
    return onChange({ from, to: date });
  }

  return (
    <div role="group" aria-label={label}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Mes anterior"
          disabled={!canPrev}
          onClick={() => setMonth(addMonths(month, -1))}
          className={ARROW_CLASS}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <p className="font-semibold first-letter:uppercase" aria-live="polite">
          {monthTitle.format(new Date(`${month}T12:00:00Z`))}
        </p>
        <button
          type="button"
          aria-label="Mes siguiente"
          disabled={!canNext}
          onClick={() => setMonth(addMonths(month, 1))}
          className={ARROW_CLASS}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div data-allow-overflow className="relative mt-3 overflow-x-auto pb-2">
        <div className="grid min-w-80 grid-cols-7 gap-1">
          {WEEKDAYS.map((d, i) => (
            <span key={d} className="py-1 text-center text-sm text-fg-muted" aria-hidden="true" title={WEEKDAY_NAMES[i]}>
              {d}
            </span>
          ))}
          {cells.map((date, i) => {
            if (!date) return <span key={`empty-${i}`} />;
            const disabled = date < today || date > lastDay;
            const inRange = value.from && value.to && date >= value.from && date <= value.to;
            const isEdge = date === value.from || date === value.to;
            return (
              <button
                key={date}
                type="button"
                data-date={date}
                disabled={disabled}
                aria-pressed={Boolean(inRange)}
                aria-label={formatLongDate(date)}
                onClick={() => pick(date)}
                className={`inline-flex min-h-11 items-center justify-center rounded-card border text-center transition-colors duration-(--duration-fast) disabled:cursor-default disabled:opacity-40 ${
                  isEdge
                    ? 'border-accent bg-accent text-accent-fg'
                    : inRange
                      ? 'border-accent bg-accent-soft text-fg'
                      : 'border-border bg-transparent text-fg hover:bg-surface-muted disabled:hover:bg-transparent'
                }`}
              >
                {Number(date.slice(8))}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
