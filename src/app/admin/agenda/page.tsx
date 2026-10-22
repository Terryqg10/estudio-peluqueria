import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/account/require-admin';
import { loadWeekAgenda } from '@/lib/admin/load-week-agenda';
import { MAX_WEEKS_AWAY, mondayOf, parseWeekQuery, weekDays, weekHref } from '@/lib/admin/week';
import { addDays, daysBetween, formatLongDate, todayInMadrid } from '@/lib/booking/dates';
import { ROUTES } from '@/lib/routes';
import { AgendaView } from './agenda-view';

export const metadata: Metadata = { title: 'Agenda' };
export const dynamic = 'force-dynamic';

const NAV_LINK =
  'inline-flex min-h-11 items-center justify-center rounded-control px-4 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';

type SearchParams = Promise<{ semana?: string | string[]; dia?: string | string[]; aviso?: string | string[] }>;

const NOTICES = {
  movida: 'Cita movida.',
  guardada: 'Cambios guardados.',
  cancelada: 'Cita cancelada.',
} as const;

export default async function AgendaPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdmin(); // un layout no basta (ADR-0022)
  const raw = await searchParams;
  const query = parseWeekQuery(raw);
  const notice =
    raw.aviso === 'movida' || raw.aviso === 'guardada' || raw.aviso === 'cancelada'
      ? NOTICES[raw.aviso]
      : null;
  const days = weekDays(query.monday);
  const today = todayInMadrid();
  const currentMonday = mondayOf(today);
  const selectedDay = query.day ?? (days.includes(today) ? today : query.monday);

  const prev = addDays(query.monday, -7);
  const next = addDays(query.monday, 7);
  const limit = MAX_WEEKS_AWAY * 7;
  const canPrev = Math.abs(daysBetween(currentMonday, prev)) <= limit;
  const canNext = Math.abs(daysBetween(currentMonday, next)) <= limit;

  const result = await loadWeekAgenda(admin.client, query.monday);
  const title = `Semana del ${formatLongDate(query.monday)} al ${formatLongDate(days[6] ?? query.monday)}`;

  return (
    <section className="mx-auto w-full max-w-screen-2xl px-(--layout-gutter) py-12 sm:py-16">
      <p>
        <Link href={ROUTES.admin} className={NAV_LINK}>
          Panel
        </Link>
      </p>
      <h1 className="font-display text-display font-semibold">Agenda</h1>

      <nav aria-label="Semanas" className="mt-4 flex flex-wrap items-center gap-2">
        {canPrev ? (
          <Link href={weekHref(ROUTES.adminAgenda, prev)} className={NAV_LINK} rel="prev">
            Semana anterior
          </Link>
        ) : null}
        <Link href={weekHref(ROUTES.adminAgenda, currentMonday)} className={NAV_LINK}>
          Hoy
        </Link>
        {canNext ? (
          <Link href={weekHref(ROUTES.adminAgenda, next)} className={NAV_LINK} rel="next">
            Semana siguiente
          </Link>
        ) : null}
      </nav>
      <p className="mt-3 text-fg-muted" data-testid="week-title">
        {title}
      </p>

      {notice ? (
        <p role="status" className="mt-4 rounded-card bg-accent-soft p-4 font-semibold text-fg">
          {notice}
        </p>
      ) : null}

      <div className="mt-6">
        {result.state === 'error' ? (
          <div role="alert" className="rounded-card bg-accent-soft p-4 text-fg">
            <p>No hemos podido cargar la agenda de esta semana.</p>
            <Link href={weekHref(ROUTES.adminAgenda, query.monday, query.day)} className={`${NAV_LINK} mt-2`}>
              Reintentar
            </Link>
          </div>
        ) : (
          <>
            {result.appointments.length === 0 ? (
              <p className="mb-4 rounded-card bg-surface p-4 font-semibold shadow-card">Sin citas esta semana</p>
            ) : null}
            <AgendaView
              stylists={result.stylists}
              appointments={result.appointments}
              days={days}
              selectedDay={selectedDay}
              monday={query.monday}
            />
          </>
        )}
      </div>
    </section>
  );
}
