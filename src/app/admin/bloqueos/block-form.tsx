'use client';

import Link from 'next/link';
import { startTransition, useActionState, useId, useState } from 'react';
import { MAX_BLOCK_DAYS_AHEAD } from '@/lib/admin/time-blocks';
import { formatLongDate, formatSlotTime } from '@/lib/booking/dates';
import { ROUTES } from '@/lib/routes';
import { createBlockAction, type BlockFormState } from './actions';
import { MonthCalendar, type DateRange } from './month-calendar';

type Props = {
  today: string;
  stylists: { id: string; name: string }[];
};

const FIELD_CLASS =
  'min-h-11 w-full rounded-card border border-border bg-surface px-4 py-2 text-fg placeholder:text-fg-muted';
const PILL_CLASS =
  'flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-border bg-surface px-5 has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-fg has-[:focus-visible]:outline-2';

// Horas de 15 en 15 minutos, de 07:00 a 22:00.
const TIMES = Array.from({ length: 61 }, (_, i) => {
  const minutes = 7 * 60 + i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-accent-text">
      {message}
    </p>
  ) : null;
}

// Formulario para añadir vacaciones o un bloqueo de franja (T-009b). Calendario propio; sin JavaScript no
// funciona (el calendario es un componente cliente), pero el servidor valida todo igualmente.
export function BlockForm({ today, stylists }: Props) {
  const [state, action, pending] = useActionState<BlockFormState, FormData>(createBlockAction, null);
  const noteId = useId();
  const [kind, setKind] = useState<'vacation' | 'block'>('vacation');
  const [stylist, setStylist] = useState('all');
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('16:00');
  const [note, setNote] = useState('');
  const errors = state?.fieldErrors ?? {};

  const summary =
    range.from === null
      ? 'Elige en el calendario'
      : kind === 'vacation' && range.to && range.to !== range.from
        ? `Del ${formatLongDate(range.from)} al ${formatLongDate(range.to)}`
        : formatLongDate(range.from);

  return (
    // Sin `action={…}` en el <form>: React reiniciaría los campos tras enviar y volvería a marcar los botones de
    // opción por su valor inicial, distinto del estado. El calendario ya exige JavaScript.
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
      className="mt-6 space-y-8"
      noValidate
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="from" value={range.from ?? ''} />
      <input type="hidden" name="to" value={range.to ?? ''} />

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

      <fieldset>
        <legend className="font-semibold">Tipo</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className={PILL_CLASS}>
            <input
              type="radio"
              name="kind-choice"
              value="vacation"
              checked={kind === 'vacation'}
              onChange={() => setKind('vacation')}
              className="sr-only"
            />
            Vacaciones
          </label>
          <label className={PILL_CLASS}>
            <input
              type="radio"
              name="kind-choice"
              value="block"
              checked={kind === 'block'}
              onChange={() => {
                setKind('block');
                setRange((r) => ({ from: r.from, to: r.from }));
              }}
              className="sr-only"
            />
            Franja horaria
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-semibold">Estilista</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {[{ id: 'all', name: 'Todas' }, ...stylists].map((s) => (
            <label key={s.id} className={PILL_CLASS}>
              <input
                type="radio"
                name="stylist"
                value={s.id}
                checked={stylist === s.id}
                onChange={() => setStylist(s.id)}
                className="sr-only"
              />
              {s.name}
            </label>
          ))}
        </div>
        <FieldError id="stylist-error" message={errors.stylist} />
      </fieldset>

      <div>
        <p className="font-semibold">{kind === 'vacation' ? 'Días de vacaciones' : 'Día'}</p>
        <p className="mt-1 text-fg-muted">
          {kind === 'vacation'
            ? 'Elige el primer día y el último (pueden ser el mismo).'
            : 'Elige el día del bloqueo.'}
        </p>
        <div className="mt-3">
          <MonthCalendar
            today={today}
            maxDaysAhead={MAX_BLOCK_DAYS_AHEAD}
            mode={kind === 'vacation' ? 'range' : 'single'}
            value={range}
            onChange={setRange}
            label={kind === 'vacation' ? 'Calendario de vacaciones' : 'Calendario del bloqueo'}
          />
        </div>
        <p className="mt-2 text-fg-muted first-letter:uppercase" aria-live="polite">
          {summary}
        </p>
        <FieldError id="from-error" message={errors.from} />
        <FieldError id="to-error" message={errors.to} />
      </div>

      {kind === 'block' ? (
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="startTime" className="font-semibold">
              Desde
            </label>
            <select
              id="startTime"
              name="startTime"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              aria-describedby={errors.startTime ? 'startTime-error' : undefined}
              className={`mt-2 ${FIELD_CLASS}`}
            >
              {TIMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <FieldError id="startTime-error" message={errors.startTime} />
          </div>
          <div>
            <label htmlFor="endTime" className="font-semibold">
              Hasta
            </label>
            <select
              id="endTime"
              name="endTime"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              aria-describedby={errors.endTime ? 'endTime-error' : undefined}
              className={`mt-2 ${FIELD_CLASS}`}
            >
              {TIMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <FieldError id="endTime-error" message={errors.endTime} />
          </div>
        </div>
      ) : null}

      <div>
        <label htmlFor={noteId} className="font-semibold">
          Nota (opcional)
        </label>
        <input
          id={noteId}
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          autoComplete="off"
          placeholder="Por ejemplo: médico, curso, festivo local"
          aria-describedby={errors.note ? 'note-error' : undefined}
          className={`mt-2 ${FIELD_CLASS}`}
        />
        <FieldError id="note-error" message={errors.note} />
      </div>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? 'Guardando…' : 'Añadir'}
        </button>
      </div>
    </form>
  );
}
