'use client';

import type { AvailabilitySlot } from '@/lib/availability/schema';
import { formatSlotTime } from '@/lib/booking/dates';
import type { StylistOption } from '@/lib/booking/types';

type Props = {
  stylists: readonly StylistOption[];
  slots: readonly AvailabilitySlot[];
  durationMin: number;
  selection: { startsAt: string; stylistId: string } | null;
  onSelect: (slot: AvailabilitySlot) => void;
};

// Minutos desde medianoche, en hora del salón, de un instante ISO (formatSlotTime ya convierte a Europe/Madrid).
function minutesOfDay(iso: string): number {
  const [h, m] = formatSlotTime(iso).split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// Agrupa las horas libres por hora entera: cada hora es una fila de 4 columnas (:00, :15, :30, :45) y cada botón va en la columna
// de su cuarto, así que la rejilla se lee contra las marcas de la regla.
function groupByHour<T extends { startsAt: string }>(slots: readonly T[]): { hour: number; items: T[] }[] {
  const groups: { hour: number; items: T[] }[] = [];
  for (const slot of slots) {
    const hour = Math.floor(minutesOfDay(slot.startsAt) / 60);
    const last = groups[groups.length - 1];
    if (last && last.hour === hour) last.items.push(slot);
    else groups.push({ hour, items: [slot] });
  }
  return groups;
}

function hourLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:00`;
}

// La jornada (T-042, ADR-0040): una fila por estilista con su regla horaria y sus horas. La regla es un resumen visual
// (decorativo): lo libre se dibuja como mechones de la longitud del servicio y la hora elegida cuelga en cobre. Los controles son
// los botones de hora, que son los de siempre (`data-starts-at`); elegir la hora de una fila es elegir a su estilista.
export function StylistRows({ stylists, slots, durationMin, selection, onSelect }: Props) {
  // Eje común a todas las filas para poder compararlas: de la primera hora entera con huecos a la última hora entera tras el último.
  const starts = slots.map((slot) => minutesOfDay(slot.startsAt));
  const axisStart = starts.length > 0 ? Math.floor(Math.min(...starts) / 60) * 60 : 10 * 60;
  const axisEnd = starts.length > 0 ? Math.ceil((Math.max(...starts) + durationMin) / 60) * 60 : 20 * 60;
  const span = Math.max(axisEnd - axisStart, 60);
  const ticks: number[] = [];
  for (let t = axisStart; t <= axisEnd; t += 120) ticks.push(t);

  return (
    <ul className="m-0 list-none p-0">
      {stylists.map((stylist) => {
        const own = slots
          .filter((slot) => slot.stylistId === stylist.id)
          .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
        const headingId = `jornada-${stylist.id}`;
        return (
          <li key={stylist.id} className="border-b border-border py-5 first:pt-0">
            <div role="group" aria-labelledby={headingId}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <h4 id={headingId} className="text-lg font-semibold tracking-tight leading-tight">
                  {stylist.name}
                </h4>
                <p className="text-fg-muted">
                  {own.length > 0 ? `${own.length} ${own.length === 1 ? 'hora libre' : 'horas libres'}` : 'Sin horas libres este día'}
                </p>
              </div>

              <div aria-hidden="true" className="mt-3">
                <div className="day-ruler">
                  {own.map((slot) => {
                    const start = minutesOfDay(slot.startsAt);
                    const on = selection?.startsAt === slot.startsAt && selection.stylistId === stylist.id;
                    return (
                      <span
                        key={slot.startsAt}
                        className="day-ruler__band"
                        data-on={on}
                        style={{
                          left: `${((start - axisStart) / span) * 100}%`,
                          width: `${(durationMin / span) * 100}%`,
                        }}
                      />
                    );
                  })}
                </div>
                <div className="relative mt-1 h-4 text-xs text-fg-muted tabular-nums">
                  {ticks.map((t) => (
                    <span
                      key={t}
                      className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
                      style={{ left: `${((t - axisStart) / span) * 100}%` }}
                    >
                      {hourLabel(t)}
                    </span>
                  ))}
                </div>
              </div>

              {own.length > 0 ? (
                <ul className="m-0 mt-3 list-none space-y-2 p-0">
                  {groupByHour(own).map((group) => (
                    <li key={group.hour} className="grid grid-cols-4 gap-2">
                      {group.items.map((slot) => {
                        const isSelected = selection?.startsAt === slot.startsAt && selection.stylistId === stylist.id;
                        const quarter = (minutesOfDay(slot.startsAt) % 60) / 15;
                        return (
                          <button
                            key={slot.startsAt}
                            type="button"
                            aria-pressed={isSelected}
                            data-starts-at={slot.startsAt}
                            data-stylist-id={stylist.id}
                            onClick={() => onSelect(slot)}
                            style={{ gridColumnStart: quarter + 1 }}
                            className={`inline-flex min-h-11 w-full items-center justify-center rounded-control border px-2 tabular-nums transition-[background-color,scale] duration-(--duration-fast) ease-(--ease-soft) active:scale-(--press-scale) ${
                              isSelected
                                ? 'border-accent bg-accent text-accent-fg'
                                : 'border-border-strong bg-surface text-fg hover:bg-surface-muted'
                            }`}
                          >
                            {formatSlotTime(slot.startsAt)}
                          </button>
                        );
                      })}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
