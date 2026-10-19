'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDayParts } from '@/lib/booking/dates';
import { ROUTES } from '@/lib/routes';
import type { NextDay } from '@/lib/availability/next-days';
import { loadNextDaysAction } from './actions';

type Props = {
  serviceId: string;
  stylistId: string | null;
  date: string;
  onSelect: (date: string) => void;
};

type Loaded = { key: string; days: NextDay[] | null };

// Día sin huecos: se proponen los próximos con disponibilidad (spec, sección 6).
export function NextDays({ serviceId, stylistId, date, onSelect }: Props) {
  const key = `${serviceId}|${stylistId ?? 'any'}|${date}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadNextDaysAction({ serviceId, date, ...(stylistId ? { stylistId } : {}) }).then((result) => {
      if (cancelled) return;
      setLoaded({ key, days: result.ok ? result.days : null });
    });
    return () => {
      cancelled = true;
    };
  }, [key, serviceId, stylistId, date]);

  const fresh = loaded !== null && loaded.key === key;

  return (
    <div className="rounded-card bg-surface p-5 shadow-card">
      <p className="font-semibold">No quedan horas libres este día.</p>
      {!fresh ? (
        <p className="mt-2 text-fg-muted">Buscando los próximos días con disponibilidad…</p>
      ) : loaded.days === null ? (
        <p className="mt-2 text-fg-muted">No hemos podido buscar otros días.</p>
      ) : loaded.days.length === 0 ? (
        <p className="mt-2 text-fg-muted">
          No hay disponibilidad en los próximos días. Consulta nuestro contacto.
        </p>
      ) : (
        <>
          <p className="mt-2 text-fg-muted">Próximos días con disponibilidad:</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {loaded.days.map((day) => {
              const { weekday, day: number, month } = formatDayParts(day.date);
              return (
                <li key={day.date}>
                  <button
                    type="button"
                    onClick={() => onSelect(day.date)}
                    className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 transition-colors duration-(--duration-fast) hover:bg-surface-muted"
                  >
                    <span className="capitalize">{weekday}</span>&nbsp;{number} {month}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Link
        href={ROUTES.contacto}
        className="mt-3 inline-flex min-h-11 items-center text-accent-text transition-colors duration-(--duration-fast) hover:text-accent-hover"
      >
        Contacto
      </Link>
    </div>
  );
}
