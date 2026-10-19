import { formatSlotTime, madridHour } from './dates';

export type Slot = { stylistId: string; startsAt: string };

// Un inicio visible en la rejilla: puede ofrecerlo más de una estilista («Cualquiera disponible»).
export type TimeOption = { startsAt: string; label: string; stylistIds: string[] };

export type PartOfDay = 'morning' | 'afternoon';

// Agrupa los huecos por instante de inicio, ordenados, con las estilistas que lo ofrecen.
export function groupSlotsByStart(slots: readonly Slot[]): TimeOption[] {
  const byStart = new Map<number, TimeOption>();
  for (const slot of slots) {
    const key = new Date(slot.startsAt).getTime();
    const existing = byStart.get(key);
    if (existing) {
      if (!existing.stylistIds.includes(slot.stylistId)) existing.stylistIds.push(slot.stylistId);
    } else {
      byStart.set(key, {
        startsAt: slot.startsAt,
        label: formatSlotTime(slot.startsAt),
        stylistIds: [slot.stylistId],
      });
    }
  }
  return [...byStart.entries()].sort(([a], [b]) => a - b).map(([, option]) => option);
}

export function partOfDay(iso: string): PartOfDay {
  return madridHour(iso) < 14 ? 'morning' : 'afternoon';
}

export function splitByPartOfDay(options: readonly TimeOption[]): Record<PartOfDay, TimeOption[]> {
  return {
    morning: options.filter((o) => partOfDay(o.startsAt) === 'morning'),
    afternoon: options.filter((o) => partOfDay(o.startsAt) === 'afternoon'),
  };
}

// Con «Cualquiera» se asigna la primera estilista que ofrece el hueco, de forma determinista.
export function pickStylist(option: TimeOption, preferred?: string): string {
  if (preferred && option.stylistIds.includes(preferred)) return preferred;
  const sorted = [...option.stylistIds].sort();
  return sorted[0] ?? '';
}
