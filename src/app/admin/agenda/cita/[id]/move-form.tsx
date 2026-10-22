'use client';

import { useId, useState } from 'react';
import { DayStrip } from '@/app/reservar/day-strip';
import { SlotGrid } from '@/app/reservar/slot-grid';
import { formatLongDate, formatSlotTime } from '@/lib/booking/dates';
import { groupSlotsByStart } from '@/lib/booking/slots';
import { NOTE_MAX_LENGTH } from '@/lib/admin/manage-appointment';
import { loadDaySlotsAction, saveAppointmentAction } from './actions';

type DaySlot = { stylistId: string; startsAt: string };

type Props = {
  appointmentId: string;
  clientName: string;
  serviceName: string;
  currentStylistId: string;
  currentStartsAt: string;
  currentDate: string;
  today: string;
  stylists: { id: string; name: string }[];
  initialSlots: DaySlot[];
  initialNote: string;
};

const FIELD_CLASS =
  'w-full rounded-card border border-border-strong bg-surface px-4 py-3 text-fg placeholder:text-fg-muted';

// Formulario de «Mover cita» (T-008d): estructura de ficha (cliente, servicio, estilista, fecha, hora, notas)
// con el carrusel de días y las horas en píldora de la reserva, y la acción principal fija abajo.
export function MoveForm({
  appointmentId,
  clientName,
  serviceName,
  currentStylistId,
  currentStartsAt,
  currentDate,
  today,
  stylists,
  initialSlots,
  initialNote,
}: Props) {
  const noteId = useId();
  const [stylistId, setStylistId] = useState(currentStylistId);
  const [date, setDate] = useState(currentDate);
  const [slots, setSlots] = useState<DaySlot[]>(initialSlots);
  const [status, setStatus] = useState<'ok' | 'loading' | 'error'>('ok');
  const [chosen, setChosen] = useState<string | null>(null); // inicio ISO del hueco elegido
  const [note, setNote] = useState(initialNote);

  const options = groupSlotsByStart(slots.filter((s) => s.stylistId === stylistId));
  const stylistName = stylists.find((s) => s.id === stylistId)?.name ?? '';

  // Elegir el mismo hueco que ya tiene la cita no es un cambio: no se envía.
  // Se compara por instante: la BD y el servidor no escriben el huso igual («+00:00» y «Z»).
  const isCurrent =
    chosen !== null &&
    Date.parse(chosen) === Date.parse(currentStartsAt) &&
    stylistId === currentStylistId;
  const slotValue = chosen && !isCurrent ? `${stylistId}|${chosen}` : '';
  const dirty = slotValue !== '' || note.trim() !== initialNote;

  async function chooseDay(next: string) {
    setDate(next);
    setChosen(null);
    setStatus('loading');
    try {
      const result = await loadDaySlotsAction(appointmentId, next);
      if (!result.ok) {
        setStatus('error');
        return;
      }
      setSlots(result.slots);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }

  function chooseStylist(id: string) {
    setStylistId(id);
    setChosen(null);
  }

  return (
    <form action={saveAppointmentAction} className="mt-8">
      <input type="hidden" name="id" value={appointmentId} />
      <input type="hidden" name="dia" value={currentDate} />
      <input type="hidden" name="slot" value={slotValue} />

      <div className="space-y-10">
        <section aria-labelledby="ficha">
          <h2 id="ficha" className="font-display text-2xl font-semibold">
            Cliente y servicio
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-card bg-surface-muted px-4 py-3">
              <dt className="text-fg-muted">Cliente</dt>
              <dd className="font-semibold">{clientName}</dd>
            </div>
            <div className="rounded-card bg-surface-muted px-4 py-3">
              <dt className="text-fg-muted">Servicio</dt>
              <dd className="font-semibold">{serviceName}</dd>
            </div>
          </dl>
        </section>

        <fieldset>
          <legend className="font-display text-2xl font-semibold">Estilista</legend>
          <ul className="mt-4 flex flex-wrap gap-2">
            {stylists.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={s.id === stylistId}
                  onClick={() => chooseStylist(s.id)}
                  className={`inline-flex min-h-11 items-center justify-center rounded-control border px-5 transition-colors duration-(--duration-fast) ${
                    s.id === stylistId
                      ? 'border-accent bg-accent text-accent-fg'
                      : 'border-border-strong bg-surface text-fg hover:bg-surface-muted'
                  }`}
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>

        <section aria-labelledby="fecha">
          <h2 id="fecha" className="font-display text-2xl font-semibold">
            Fecha
          </h2>
          <div className="mt-4">
            <DayStrip today={today} selected={date} onSelect={(next) => void chooseDay(next)} />
          </div>
        </section>

        <section aria-labelledby="hora">
          <h2 id="hora" className="font-display text-2xl font-semibold">
            Hora
          </h2>
          <p className="mt-1 text-fg-muted first-letter:uppercase">{formatLongDate(date)}</p>
          <div className="mt-4" aria-live="polite">
            {status === 'loading' ? <p className="text-fg-muted">Buscando huecos…</p> : null}
            {status === 'error' ? (
              <p role="alert" className="rounded-card bg-accent-soft p-4 text-fg">
                No hemos podido cargar los huecos. Elige otro día o inténtalo de nuevo.
              </p>
            ) : null}
            {status === 'ok' && options.length === 0 ? (
              <p className="text-fg-muted">No hay huecos libres con {stylistName} ese día.</p>
            ) : null}
            {status === 'ok' && options.length > 0 ? (
              <SlotGrid options={options} selectedStart={chosen} onSelect={(o) => setChosen(o.startsAt)} />
            ) : null}
          </div>
        </section>

        <section>
          <label htmlFor={noteId} className="font-display text-2xl font-semibold">
            Notas para la estilista
          </label>
          <textarea
            id={noteId}
            name="nota"
            rows={4}
            maxLength={NOTE_MAX_LENGTH}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Por ejemplo: alergia a un producto, prefiere hablar poco…"
            className={`mt-4 ${FIELD_CLASS}`}
          />
          <p className="mt-1 text-right text-fg-muted">
            {note.length}/{NOTE_MAX_LENGTH}
          </p>
        </section>
      </div>

      <div className="sticky bottom-4 z-30 mt-10 flex flex-wrap items-center justify-between gap-3 rounded-container bg-surface p-4 shadow-card">
        <p className="min-w-0 flex-1 basis-56" aria-live="polite">
          {slotValue !== '' && chosen ? (
            <>
              <span className="block text-fg-muted">Nueva cita</span>
              <span className="block font-semibold first-letter:uppercase">
                {formatLongDate(date)}, {formatSlotTime(chosen)} · {stylistName}
              </span>
            </>
          ) : (
            <span className="text-fg-muted">
              {dirty ? 'Solo se guardará la nota.' : 'Elige un hueco o escribe una nota para guardar.'}
            </span>
          )}
        </p>
        <button
          type="submit"
          disabled={!dirty}
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover disabled:opacity-60"
        >
          Guardar cambios
        </button>
      </div>
    </form>
  );
}
