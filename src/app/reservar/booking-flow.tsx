'use client';

import { useMemo, useState } from 'react';
import type { AvailabilitySlot } from '@/lib/availability/schema';
import { formatLongDate, formatSlotTime } from '@/lib/booking/dates';
import { groupSlotsByStart, pickStylist, type TimeOption } from '@/lib/booking/slots';
import type { BookingData } from '@/lib/booking/types';
import { useLiveAvailability } from '@/lib/booking/use-live-availability';
import { formatPriceFrom } from '@/lib/services/catalog';
import { BookingForm, EMPTY_CONTACT, type ContactValues } from './booking-form';
import { DayStrip } from './day-strip';
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
  const [selection, setSelection] = useState<Selection | null>(null);
  // Datos de contacto y alternativas viven aquí: si el hueco se ocupa y el formulario se oculta,
  // lo tecleado no se pierde.
  const [contact, setContact] = useState<ContactValues>(EMPTY_CONTACT);
  const [alternatives, setAlternatives] = useState<AvailabilitySlot[] | null>(null);

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
    setAlternatives(null);
  }

  function chooseStylist(id: string) {
    setStylistChoice(id);
    setSelection(null);
    setAlternatives(null);
  }

  function chooseDate(next: string) {
    setDate(next);
    setSelection(null);
    setAlternatives(null);
  }

  function chooseSlot(option: TimeOption) {
    setSelection({ startsAt: option.startsAt, stylistId: pickStylist(option, stylistId ?? undefined) });
    setAlternatives(null);
  }

  // La BD dijo que el hueco ya no está libre: se guardan las alternativas y se vuelve a consultar.
  function handleSlotUnavailable(next: AvailabilitySlot[]) {
    setAlternatives(next);
    void refresh();
  }

  function pickAlternative(slot: AvailabilitySlot) {
    setSelection({ startsAt: slot.startsAt, stylistId: slot.stylistId });
    setAlternatives(null);
  }

  // Solo se proponen alternativas compatibles con el filtro de estilista actual.
  const visibleAlternatives = (alternatives ?? []).filter(
    (slot) => stylistId === null || slot.stylistId === stylistId,
  );

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
            <h3 id="dia-titulo" className="font-display text-3xl font-semibold">
              Elige día y hora
            </h3>
            <DayStrip today={today} selected={date} onSelect={chooseDate} />

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
              <div role="status" className="rounded-card bg-accent-soft p-4 text-fg">
                <p>Esa hora acaba de ocuparse. Elige otra.</p>
                {visibleAlternatives.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-fg-muted">Horas libres cercanas:</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {visibleAlternatives.map((slot) => (
                        <li key={`${slot.stylistId}-${slot.startsAt}`}>
                          <button
                            type="button"
                            onClick={() => pickAlternative(slot)}
                            className="inline-flex min-h-11 items-center rounded-control border border-border bg-surface px-4 transition-colors duration-(--duration-fast) hover:bg-surface-muted"
                          >
                            {formatSlotTime(slot.startsAt)} · {data.stylists.find((s) => s.id === slot.stylistId)?.name ?? ''}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
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
              <BookingForm
                serviceId={service.id}
                stylistId={selection.stylistId}
                startsAt={selection.startsAt}
                values={contact}
                onValuesChange={setContact}
                onSlotUnavailable={handleSlotUnavailable}
              />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
