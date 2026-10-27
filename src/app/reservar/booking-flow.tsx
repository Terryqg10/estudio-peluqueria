'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AvailabilitySlot } from '@/lib/availability/schema';
import { formatDayParts, formatLongDate, formatSlotTime } from '@/lib/booking/dates';
import { groupSlotsByStart } from '@/lib/booking/slots';
import type { BookingData } from '@/lib/booking/types';
import { useLiveAvailability } from '@/lib/booking/use-live-availability';
import { formatDuration, formatPriceFrom } from '@/lib/services/catalog';
import { BookingForm, EMPTY_CONTACT, type ContactValues } from './booking-form';
import { DayStrip } from './day-strip';
import { NextDays } from './next-days';
import { ServicePicker } from './service-picker';
import { StylistPicker } from './stylist-picker';
import { StylistRows } from './stylist-rows';

type Props = {
  data: BookingData;
  today: string; // calculado en el servidor, en Europe/Madrid
  initialServiceId: string | null;
  // Clienta con sesión (T-021): datos del perfil para precargar el formulario. El servidor reserva con la
  // cuenta de la sesión; esto solo rellena campos.
  account: { email: string; name: string | null; phone: string | null } | null;
};

type Selection = { startsAt: string; stylistId: string };

// Flujo de selección de hueco (RF-02, CA-05, CA-07): servicio → estilista → día → hora.
// Llega hasta elegir un hueco; los datos de la clienta y la confirmación son T-005b.
export function BookingFlow({ data, today, initialServiceId, account }: Props) {
  const [serviceId, setServiceId] = useState<string | null>(initialServiceId);
  const [stylistChoice, setStylistChoice] = useState<string>('any');
  const [date, setDate] = useState(today);
  const [selection, setSelection] = useState<Selection | null>(null);
  // Datos de contacto y alternativas viven aquí: si el hueco se ocupa y el formulario se oculta,
  // lo tecleado no se pierde.
  const [contact, setContact] = useState<ContactValues>(() =>
    account
      ? { ...EMPTY_CONTACT, email: account.email, name: account.name ?? '', phone: account.phone ?? '' }
      : EMPTY_CONTACT,
  );
  const [alternatives, setAlternatives] = useState<AvailabilitySlot[] | null>(null);
  // Tras elegir servicio, el día y la hora quedan fuera de la vista: se lleva la vista hasta ellos (T-042).
  const dayHeadingRef = useRef<HTMLHeadingElement>(null);
  const [scrollToDay, setScrollToDay] = useState(false);

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
    setScrollToDay(true);
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

  // La hora se elige en la fila de su estilista: elegir la hora es elegir a quien la hace (T-042).
  function chooseSlot(slot: AvailabilitySlot) {
    setSelection({ startsAt: slot.startsAt, stylistId: slot.stylistId });
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
  useEffect(() => {
    if (!scrollToDay || !dayHeadingRef.current) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    dayHeadingRef.current.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setScrollToDay(false);
  }, [scrollToDay, serviceId]);
  const rowStylists = stylistId ? offeredStylists.filter((st) => st.id === stylistId) : offeredStylists;
  const swatch = service ? (data.services.findIndex((s) => s.id === service.id) % 8) + 1 : 1;
  const dayParts = formatDayParts(date);
  // Barra inferior en móvil, en dos líneas: hora y estilista primero (la decisión de este flujo), servicio y día después.
  const summaryLead =
    selectedOption && selection && assignedStylist
      ? `${selectedOption.label} · ${assignedStylist.name.split(' ')[0]}`
      : '';
  const summaryRest = service ? `${service.name} · ${dayParts.weekday} ${dayParts.day}` : '';

  return (
    <div
      className={`lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-10 ${selectedOption ? 'pb-28 lg:pb-0' : ''}`}
      data-channel={channel}
    >
      <div className="min-w-0 space-y-12">
        <ServicePicker services={data.services} selectedId={serviceId} onSelect={chooseService} />

        {!service ? (
          <p className="text-fg-muted">Elige un servicio para ver las estilistas y los horarios.</p>
        ) : offeredIds.length === 0 ? (
          <div role="status" className="border-y border-border-strong py-5">
            <p className="font-semibold">Este servicio no está disponible ahora mismo.</p>
            <p className="mt-1 text-fg-muted">Elige otro o consulta nuestro contacto.</p>
          </div>
        ) : (
          <>
            <section aria-labelledby="dia-titulo" className="space-y-5">
              <h3
                id="dia-titulo"
                ref={dayHeadingRef}
                className="scroll-mt-24 font-display text-3xl font-semibold tracking-tight leading-tight"
              >
                Elige día y hora
              </h3>
              <DayStrip today={today} selected={date} onSelect={chooseDate} />
              {offeredStylists.length > 1 ? (
                <StylistPicker stylists={offeredStylists} selectedId={stylistChoice} onSelect={chooseStylist} />
              ) : null}

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
                              className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 transition-colors duration-(--duration-fast) ease-(--ease-soft) hover:bg-surface-muted"
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
                <div role="alert" className="border-y border-border-strong py-5">
                  <p className="font-semibold">No hemos podido cargar los horarios.</p>
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    className="mt-3 inline-flex min-h-11 items-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) ease-(--ease-soft) hover:bg-accent-hover"
                  >
                    Reintentar
                  </button>
                </div>
              ) : status === 'ready' && options.length === 0 ? (
                <NextDays serviceId={service.id} stylistId={stylistId} date={date} onSelect={chooseDate} />
              ) : (
                <StylistRows
                  stylists={rowStylists}
                  slots={slots}
                  durationMin={service.durationMin}
                  selection={selectedOption && selection ? selection : null}
                  onSelect={chooseSlot}
                />
              )}
            </section>

            {selectedOption && selection ? (
              <section id="datos" aria-label="Tus datos" className="scroll-mt-24">
                <BookingForm
                  serviceId={service.id}
                  stylistId={selection.stylistId}
                  startsAt={selection.startsAt}
                  values={contact}
                  onValuesChange={setContact}
                  onSlotUnavailable={handleSlotUnavailable}
                  emailLocked={account !== null}
                />
              </section>
            ) : null}
          </>
        )}
      </div>

      <aside aria-label="Resumen de la reserva" className="lg:sticky lg:top-24">
        {selectedOption && selection && service ? (
          <section
            aria-labelledby="resumen-titulo"
            className="fixed inset-x-0 bottom-0 z-30 border-t border-border-strong bg-surface px-(--layout-gutter) py-3 lg:static lg:border lg:p-5"
          >
            <h3
              id="resumen-titulo"
              className="sr-only font-display text-2xl font-semibold tracking-tight leading-tight lg:not-sr-only"
            >
              Tu cita
            </h3>
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG propio, decorativo, con tamaño reservado */}
            <img
              src={`/images/carta/muestra-${swatch}-h.svg`}
              alt=""
              width={440}
              height={120}
              className="mt-3 hidden h-auto w-full lg:block"
            />
            <p className="font-semibold tabular-nums lg:hidden">{summaryLead}</p>
            <p className="text-fg-muted lg:hidden">{summaryRest}</p>
            <dl className="mt-4 hidden gap-3 lg:grid">
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
                <dt className="text-fg-muted">Hora y duración</dt>
                <dd className="font-semibold tabular-nums">
                  {selectedOption.label} · {formatDuration(service.durationMin)}
                </dd>
              </div>
              <div>
                <dt className="text-fg-muted">Precio</dt>
                <dd className="font-semibold tabular-nums">{formatPriceFrom(service.priceFromCents)}</dd>
              </div>
            </dl>
            <a
              href="#datos"
              className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-control border border-border-strong px-5 font-semibold text-fg transition-[background-color,scale] duration-(--duration-fast) ease-(--ease-soft) hover:bg-surface-muted active:scale-(--press-scale) lg:mt-5 lg:w-auto"
            >
              Continuar con tus datos
            </a>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
