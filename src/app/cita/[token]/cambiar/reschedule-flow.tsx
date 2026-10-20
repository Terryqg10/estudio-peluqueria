'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MAX_DAYS_AHEAD, daysBetween, formatLongDate, formatSlotTime, madridDateOf } from '@/lib/booking/dates';
import type { RescheduleError } from '@/lib/booking/reschedule-appointment';
import { groupSlotsByStart, pickStylist, type TimeOption } from '@/lib/booking/slots';
import type { StylistOption } from '@/lib/booking/types';
import { useLiveAvailability, type SlotLoader } from '@/lib/booking/use-live-availability';
import { ROUTES } from '@/lib/routes';
import { DAY_STRIP_STEP, DayStrip } from '@/app/reservar/day-strip';
import { SlotGrid } from '@/app/reservar/slot-grid';
import { StylistPicker } from '@/app/reservar/stylist-picker';
import { loadRescheduleAvailabilityAction, rescheduleAppointmentAction } from './actions';

type Props = {
  token: string;
  serviceId: string;
  serviceName: string;
  current: { stylistId: string; stylistName: string; startsAt: string };
  stylists: StylistOption[]; // las que hacen este servicio
  today: string; // calculado en el servidor, en Europe/Madrid
};

type Selection = { startsAt: string; stylistId: string };

const MESSAGES: Record<RescheduleError, string> = {
  INVALID_LINK: 'Este enlace ya no es válido. Si necesitas ayuda con tu cita, contacta con el salón.',
  INVALID_INPUT: 'No hemos podido procesar el cambio. Elige otra hora e inténtalo de nuevo.',
  TOO_LATE: 'Ya faltan menos de 24 horas para tu cita y no se puede cambiar desde aquí. Contacta con el salón.',
  SLOT_TAKEN: 'Esa hora acaba de ocuparse. Elige otra.',
  OUT_OF_WINDOW: 'Esa hora ya no se puede reservar. Elige otra.',
  NO_CHANGE: 'Esa es tu hora actual. Elige un día, una hora o una estilista distintos.',
  UNAVAILABLE: 'No hemos podido cambiar la cita. Inténtalo de nuevo en unos minutos.',
};

const LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-6 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';

// Cambio de cita (RF-05, T-006c): misma estructura que /reservar (estilista → día → hora), con los
// huecos que calcula la BD sin contar la propia cita. El servicio no cambia.
export function RescheduleFlow({ token, serviceId, serviceName, current, stylists, today }: Props) {
  const router = useRouter();
  const [stylistChoice, setStylistChoice] = useState<string>('any');
  const [date, setDate] = useState(madridDateOf(current.startsAt) > today ? madridDateOf(current.startsAt) : today);
  const [daysShown, setDaysShown] = useState(DAY_STRIP_STEP);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<RescheduleError | null>(null);
  const [pending, setPending] = useState(false);

  const stylistId = stylistChoice === 'any' ? null : stylistChoice;
  const stylistIds = useMemo(() => stylists.map((s) => s.id), [stylists]);

  // El cargador consulta los huecos del token (sin la propia cita) y se filtra aquí por estilista.
  const load: SlotLoader = useMemo(
    () => async (params) => {
      const result = await loadRescheduleAvailabilityAction({ token, date: params.date });
      return result.ok ? { ok: true, slots: result.slots } : { ok: false };
    },
    [token],
  );

  const { slots, status, refresh } = useLiveAvailability(
    { serviceId, stylistId: null, date, stylistIds },
    load,
  );

  const options = useMemo(
    () =>
      groupSlotsByStart(
        slots.filter(
          (slot) =>
            (stylistId === null || slot.stylistId === stylistId) &&
            // La hora actual no se ofrece como cambio.
            !(slot.stylistId === current.stylistId && slot.startsAt === new Date(current.startsAt).toISOString()),
        ),
      ),
    [slots, stylistId, current.stylistId, current.startsAt],
  );

  const selectedOption = selection
    ? (options.find(
        (o) => o.startsAt === selection.startsAt && o.stylistIds.includes(selection.stylistId),
      ) ?? null)
    : null;
  const selectionLost = status === 'ready' && selection !== null && selectedOption === null;
  const assignedStylist = selection ? stylists.find((s) => s.id === selection.stylistId) : undefined;

  function chooseStylist(id: string) {
    setStylistChoice(id);
    setSelection(null);
    setError(null);
  }

  function chooseDate(next: string) {
    setDate(next);
    const needed = daysBetween(today, next) + 1;
    setDaysShown((shown) => Math.min(MAX_DAYS_AHEAD, Math.max(shown, needed)));
    setSelection(null);
    setError(null);
  }

  function chooseSlot(option: TimeOption) {
    setSelection({ startsAt: option.startsAt, stylistId: pickStylist(option, stylistId ?? undefined) });
    setError(null);
  }

  async function confirm() {
    if (!selection || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await rescheduleAppointmentAction({
        token,
        stylistId: selection.stylistId,
        startsAt: selection.startsAt,
      });
      if (result.ok) {
        router.push(`${ROUTES.cita}/${token}?cambiada=1`);
        return;
      }
      setError(result.error);
      if (result.error === 'SLOT_TAKEN' || result.error === 'OUT_OF_WINDOW') void refresh();
      // Sin margen o con enlace no válido, la cita ya no se puede cambiar: se vuelve a ella.
      if (result.error === 'TOO_LATE' || result.error === 'INVALID_LINK') setSelection(null);
    } catch {
      setError('UNAVAILABLE');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-12">
      <section aria-labelledby="actual-titulo" className="rounded-container bg-surface p-6 shadow-card">
        <h2 id="actual-titulo" className="font-display text-2xl font-semibold">
          Tu cita actual
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-fg-muted">Servicio</dt>
            <dd className="font-semibold">{serviceName}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Estilista</dt>
            <dd className="font-semibold">{current.stylistName}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Día</dt>
            <dd className="font-semibold first-letter:uppercase">
              {formatLongDate(madridDateOf(current.startsAt))}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">Hora</dt>
            <dd className="font-semibold">{formatSlotTime(current.startsAt)}</dd>
          </div>
        </dl>
      </section>

      <StylistPicker stylists={stylists} selectedId={stylistChoice} onSelect={chooseStylist} />

      <section aria-labelledby="dia-titulo" className="space-y-4">
        <h2 id="dia-titulo" className="font-display text-2xl font-semibold">
          Elige día y hora nuevos
        </h2>
        <DayStrip
          today={today}
          selected={date}
          visibleCount={daysShown}
          onSelect={chooseDate}
          onShowMore={() => setDaysShown((n) => Math.min(MAX_DAYS_AHEAD, n + DAY_STRIP_STEP))}
        />

        <p role="status" className="text-fg-muted">
          {status === 'loading'
            ? 'Buscando horas disponibles…'
            : status === 'ready' && options.length > 0
              ? `${options.length} horas disponibles el ${formatLongDate(date)}`
              : ''}
        </p>

        {selectionLost ? (
          <div role="status" className="rounded-card bg-accent-soft p-4 text-fg">
            <p>Esa hora acaba de ocuparse. Elige otra.</p>
          </div>
        ) : null}

        {status === 'error' ? (
          <div role="alert" className="rounded-card bg-surface p-5 shadow-card">
            <p className="font-semibold">No hemos podido cargar los horarios.</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-3 inline-flex min-h-11 items-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover"
            >
              Reintentar
            </button>
          </div>
        ) : status === 'ready' && options.length === 0 ? (
          <p className="rounded-card bg-surface p-5 text-fg-muted shadow-card">
            No quedan horas libres este día. Prueba con otro día de la tira.
          </p>
        ) : (
          <SlotGrid options={options} selectedStart={selectedOption?.startsAt ?? null} onSelect={chooseSlot} />
        )}
      </section>

      {error ? (
        <div role="alert" className="rounded-card bg-accent-soft p-4 text-fg">
          <p>{MESSAGES[error]}</p>
          {error === 'TOO_LATE' || error === 'INVALID_LINK' ? (
            <Link href={ROUTES.contacto} className="mt-2 inline-flex min-h-11 items-center text-accent-text hover:underline">
              Contacto
            </Link>
          ) : null}
        </div>
      ) : null}

      {selectedOption && selection ? (
        <section aria-labelledby="nueva-titulo" className="rounded-container bg-surface p-6 shadow-card">
          <h2 id="nueva-titulo" className="font-display text-2xl font-semibold">
            Tu cita nueva
          </h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-fg-muted">Estilista</dt>
              <dd className="font-semibold">{assignedStylist?.name ?? ''}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Día</dt>
              <dd className="font-semibold first-letter:uppercase">{formatLongDate(date)}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Hora</dt>
              <dd className="font-semibold">{selectedOption.label}</dd>
            </div>
          </dl>
          <div className="mt-6">
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-control bg-accent px-8 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? 'Cambiando…' : 'Confirmar el cambio'}
            </button>
          </div>
        </section>
      ) : null}

      <div>
        <Link href={`${ROUTES.cita}/${token}`} className={LINK_CLASS}>
          Volver a mi cita
        </Link>
      </div>
    </div>
  );
}
