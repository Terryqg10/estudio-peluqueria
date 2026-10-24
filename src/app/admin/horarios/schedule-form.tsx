'use client';

import Link from 'next/link';
import { startTransition, useActionState, useState } from 'react';
import { TIME_OPTIONS, WEEKDAYS, type ScheduleRange } from '@/lib/admin/schedules';
import { formatLongDate, formatSlotTime } from '@/lib/booking/dates';
import { SELECT_BOX_CLASS, SelectBox } from '@/components/admin/select-box';
import { ROUTES } from '@/lib/routes';
import { saveScheduleAction, type ScheduleFormState } from './actions';

type Props = {
  scope: string; // 'salon' o el id de una estilista
  scopeLabel: string;
  initial: ScheduleRange[];
};

type Row = { key: number; start: string; end: string };

const BUTTON_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control px-4 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft disabled:opacity-40 disabled:hover:bg-transparent';

const END_OF_DAY = TIME_OPTIONS[TIME_OPTIONS.length - 1] ?? '22:00';

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min((h ?? 0) * 60 + (m ?? 0) + minutes, 22 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Formulario de la semana de un ámbito (T-009c): un tramo o más por día; sin tramos, día libre.
export function ScheduleForm({ scope, scopeLabel, initial }: Props) {
  const [state, action, pending] = useActionState<ScheduleFormState, FormData>(saveScheduleAction, null);
  const [nextKey, setNextKey] = useState(() => initial.length);
  const [days, setDays] = useState<Row[][]>(() =>
    WEEKDAYS.map((_, i) =>
      initial
        .map((r, index) => ({ r, index }))
        .filter(({ r }) => r.weekday === i + 1)
        .map(({ r, index }) => ({ key: index, start: r.starts, end: r.ends })),
    ),
  );

  function update(day: number, key: number, patch: Partial<Row>) {
    setDays((all) => all.map((rows, i) => (i === day ? rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) : rows)));
  }

  function add(day: number) {
    const rows = days[day] ?? [];
    const last = rows[rows.length - 1];
    const start = last ? last.end : '10:00';
    setDays((all) => all.map((r, i) => (i === day ? [...r, { key: nextKey, start, end: addMinutes(start, 240) }] : r)));
    setNextKey(nextKey + 1);
  }

  function remove(day: number, key: number) {
    setDays((all) => all.map((rows, i) => (i === day ? rows.filter((r) => r.key !== key) : rows)));
  }

  const ranges = days.flatMap((rows, i) => rows.map((r) => ({ weekday: i + 1, starts: r.start, ends: r.end })));

  // Sin `action={…}` en el <form>: React reiniciaría los campos tras enviar (ver el formulario de bloqueos).
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
      className="mt-6 space-y-6"
      noValidate
    >
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="ranges" value={JSON.stringify(ranges)} />

      {state?.error ? (
        <div role="alert" className="rounded-card bg-accent-soft p-4 text-fg">
          <p>{state.error}</p>
          {state.conflicts.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {state.conflicts.map((c) => (
                <li key={c.appointmentId} data-conflict-id={c.appointmentId} className="rounded-card bg-surface p-3">
                  <p className="font-semibold">
                    {c.clientName} · {c.stylistName}
                  </p>
                  <p className="text-fg-muted first-letter:uppercase">
                    {formatLongDate(c.date)}, {formatSlotTime(c.startsAt)}–{formatSlotTime(c.endsAt)}
                  </p>
                  <Link
                    href={`${ROUTES.adminAgenda}/cita/${c.appointmentId}`}
                    className="inline-flex min-h-11 items-center text-accent-text"
                  >
                    Mover o cancelar esta cita
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <ul className="space-y-3">
        {WEEKDAYS.map((name, day) => {
          const rows = days[day] ?? [];
          const last = rows[rows.length - 1];
          return (
            <li key={name} data-weekday={day + 1} className="rounded-container bg-surface p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">{name}</h3>
                <button
                  type="button"
                  onClick={() => add(day)}
                  disabled={last !== undefined && last.end >= END_OF_DAY}
                  aria-label={`Añadir tramo el ${name.toLowerCase()}`}
                  className={BUTTON_CLASS}
                >
                  Añadir tramo
                </button>
              </div>
              {rows.length === 0 ? (
                <p className="mt-2 text-fg-muted">Día libre</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {rows.map((row) => (
                    <li key={row.key} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <div>
                        <label htmlFor={`s-${row.key}`} className="text-fg-muted">
                          Desde <span className="sr-only">({name.toLowerCase()})</span>
                        </label>
                        <SelectBox>
                          <select
                            id={`s-${row.key}`}
                            value={row.start}
                            onChange={(e) => update(day, row.key, { start: e.target.value })}
                            className={SELECT_BOX_CLASS}
                          >
                            {TIME_OPTIONS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </SelectBox>
                      </div>
                      <div>
                        <label htmlFor={`e-${row.key}`} className="text-fg-muted">
                          Hasta <span className="sr-only">({name.toLowerCase()})</span>
                        </label>
                        <SelectBox>
                          <select
                            id={`e-${row.key}`}
                            value={row.end}
                            onChange={(e) => update(day, row.key, { end: e.target.value })}
                            className={SELECT_BOX_CLASS}
                          >
                            {TIME_OPTIONS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </SelectBox>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(day, row.key)}
                        aria-label={`Quitar tramo ${row.start}–${row.end} del ${name.toLowerCase()}`}
                        className={BUTTON_CLASS}
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? 'Guardando…' : `Guardar horario ${scopeLabel}`}
        </button>
      </div>
    </form>
  );
}
