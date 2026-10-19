'use client';

import { useMemo, useState } from 'react';
import { MAX_DAYS_AHEAD, daysBetween, formatLongDate } from '@/lib/booking/dates';
import { groupSlotsByStart, pickStylist, type TimeOption } from '@/lib/booking/slots';
import type { BookingData } from '@/lib/booking/types';
import { useLiveAvailability } from '@/lib/booking/use-live-availability';
import { formatPriceFrom } from '@/lib/services/catalog';
import { DAY_STRIP_STEP, DayStrip } from './day-strip';
import { NextDays } from './next-days';
import { ServicePicker } from './service-picker';
import { SlotGrid } from './slot-grid';
import { StylistPicker } from './stylist-picker';

type Props = {
  data: BookingData;
  today: string; // calculado en el servidor, en Europe/Madrid
  initialServiceId: string | null;
};

type Selection = { startsAt: string; stylistId: string };

// Flujo de selección de hueco (RF-02, CA-05, CA-07): servicio → estilista → día → hora.
// Llega hasta elegir un hueco; los datos de la clienta y la confirmación son T-005b.
export function BookingFlow({ data, today, initialServiceId }: Props) {
  const [serviceId, setServiceId] = useState<string | null>(initialServiceId);
  const [stylistChoice, setStylistChoice] = useState<string>('any');
  const [date, setDate] = useState(today);
  const [daysShown, setDaysShown] = useState(DAY_STRIP_STEP);
  const [selection, setSelection] = useState<Selection | null>(null);

  const service = data.services.find((s) => s.id === serviceId) ?? null;
  const offeredIds = useMemo(
    () => (serviceId ? (data.offers[serviceId] ?? []) : []),
    [data.offers, serviceId],
  );
  const offeredStylists = data.stylists.filter((s) => offeredIds.includes(s.id));
  const stylistId = stylistChoice === 'any' ? null : stylistChoice;

  const { slots, status, channel, refresh } = useLiveAvailability(
    service && offeredIds.length > 0
      ? { serviceId: service.id, stylistId, date, stylistIds: stylistId ? [stylistId] : offeredIds }
      : null,
  );
  const options = useMemo(() => groupSlotsByStart(slots), [slots]);

  const selectedOption = selection
    ? (options.find(
        (o) => o.startsAt === selection.startsAt && o.stylistIds.includes(selection.stylistId),
      ) ?? null)
    : null;
  // El hueco elegido deja de estar libre (otra persona lo ha reservado): se avisa y se descarta.
  const selectionLost = status === 'ready' && selection !== null && selectedOption === null;

  function chooseService(id: string) {
    setServiceId(id);
    const offered = data.offers[id] ?? [];
    if (stylistChoice !== 'any' && !offered.includes(stylistChoice)) setStylistChoice('any');
    setSelection(null);
  }

  function chooseStylist(id: string) {
    setStylistChoice(id);
    setSelection(null);
  }

  function chooseDate(next: string) {
    setDate(next);
    const needed = daysBetween(today, next) + 1;
    setDaysShown((shown) => Math.min(MAX_DAYS_AHEAD, Math.max(shown, needed)));
    setSelection(null);
  }

  function chooseSlot(option: TimeOption) {
    setSelection({ startsAt: option.startsAt, stylistId: pickStylist(option, stylistId ?? undefined) });
  }

  const assignedStylist = selection
    ? data.stylists.find((s) => s.id === selection.stylistId)
    : undefined;

  return (
    <div className="space-y-12" data-channel={channel}>
      <ServicePicker services={data.services} selectedId={serviceId} onSelect={chooseService} />

      {!service ? (
        <p className="text-fg-muted">Elige un servicio para ver las estilistas y los horarios.</p>
      ) : offeredIds.length === 0 ? (
        <div role="status" className="rounded-card bg-surface p-5 shadow-card">
          <p className="font-semibold">Este servicio no está disponible ahora mismo.</p>
          <p className="mt-1 text-fg-muted">Elige otro o consulta nuestro contacto.</p>
        </div>
      ) : (
        <>
          <StylistPicker stylists={offeredStylists} selectedId={stylistChoice} onSelect={chooseStylist} />

          <section aria-labelledby="dia-titulo" className="space-y-4">
            <h3 id="dia-titulo" className="font-display text-2xl font-semibold">
              Elige día y hora
            </h3>
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
                : status === 'error'
                  ? ''
                  : options.length > 0
                    ? `${options.length} horas disponibles el ${formatLongDate(date)}`
                    : ''}
            </p>

            {selectionLost ? (
              <p role="status" className="rounded-card bg-accent-soft p-4 text-fg">
                Esa hora acaba de ocuparse. Elige otra.
              </p>
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
              <NextDays serviceId={service.id} stylistId={stylistId} date={date} onSelect={chooseDate} />
            ) : (
              <SlotGrid options={options} selectedStart={selectedOption?.startsAt ?? null} onSelect={chooseSlot} />
            )}
          </section>

          {selectedOption && selection ? (
            <section
              aria-labelledby="resumen-titulo"
              className="rounded-container bg-surface p-6 shadow-card"
            >
              <h3 id="resumen-titulo" className="font-display text-2xl font-semibold">
                Tu cita
              </h3>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-fg-muted">Servicio</dt>
                  <dd className="font-semibold">{service.name}</dd>
                </div>
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
                <div>
                  <dt className="text-fg-muted">Precio</dt>
                  <dd className="font-semibold text-accent-text">{formatPriceFrom(service.priceFromCents)}</dd>
                </div>
              </dl>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
