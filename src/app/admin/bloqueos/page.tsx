import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/account/require-admin';
import { loadUpcomingBlocks, type TimeBlockRow } from '@/lib/admin/time-blocks';
import { formatLongDate, formatSlotTime, madridDateOf, todayInMadrid } from '@/lib/booking/dates';
import { ROUTES } from '@/lib/routes';
import { removeBlockAction } from './actions';
import { BlockForm } from './block-form';

export const metadata: Metadata = { title: 'Bloqueos y vacaciones' };
export const dynamic = 'force-dynamic';

const LINK_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control px-4 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';

const NOTICES: Record<string, string> = {
  creado: 'Bloqueo creado.',
  quitado: 'Bloqueo quitado.',
  error: 'No hemos podido quitar el bloqueo. Inténtalo de nuevo.',
};

type SearchParams = Promise<{ aviso?: string }>;

// «Del lunes 3 al viernes 7», «lunes 3 · 14:00–16:00»…
function describe(block: TimeBlockRow): string {
  const first = madridDateOf(block.startsAt);
  const last = madridDateOf(new Date(new Date(block.endsAt).getTime() - 1).toISOString());
  if (block.kind === 'vacation') {
    return first === last ? formatLongDate(first) : `Del ${formatLongDate(first)} al ${formatLongDate(last)}`;
  }
  return `${formatLongDate(first)} · ${formatSlotTime(block.startsAt)}–${formatSlotTime(block.endsAt)}`;
}

export default async function BlocksPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdmin(); // un layout no basta (ADR-0022)
  const { aviso } = await searchParams;
  const [blocks, stylists] = await Promise.all([
    loadUpcomingBlocks(admin.client),
    admin.client.from('stylists').select('id, name').eq('active', true).order('name', { ascending: true }),
  ]);
  const notice = aviso ? (NOTICES[aviso] ?? null) : null;

  return (
    <section className="mx-auto w-full max-w-3xl px-(--layout-gutter) py-12 sm:py-16">
      <p>
        <Link href={ROUTES.admin} className={LINK_CLASS}>
          Panel
        </Link>
      </p>
      <h1 className="font-display text-display font-semibold">Bloqueos y vacaciones</h1>

      {notice ? (
        <p role="status" className="mt-4 rounded-card bg-accent-soft p-4 font-semibold text-fg">
          {notice}
        </p>
      ) : null}

      <h2 className="mt-10 font-display text-2xl font-semibold">Próximos</h2>
      {blocks === 'error' ? (
        <div role="alert" className="mt-4 rounded-card bg-accent-soft p-4 text-fg">
          <p>No hemos podido cargar los bloqueos.</p>
          <Link href={ROUTES.adminBloqueos} className={`${LINK_CLASS} mt-2`}>
            Reintentar
          </Link>
        </div>
      ) : blocks.length === 0 ? (
        <p className="mt-4 rounded-container bg-surface p-6 text-fg-muted shadow-card">
          No hay bloqueos ni vacaciones próximos.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {blocks.map((b) => (
            <li key={b.id} data-block-id={b.id} className="rounded-container bg-surface p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {b.kind === 'vacation' ? 'Vacaciones' : 'Bloqueo'} · {b.stylistName}
                  </p>
                  <p className="text-fg-muted first-letter:uppercase">{describe(b)}</p>
                  {b.note ? <p className="mt-1 break-words text-fg-muted">{b.note}</p> : null}
                </div>
                <form action={removeBlockAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <button type="submit" aria-label={`Quitar ${b.stylistName}: ${describe(b)}`} className={LINK_CLASS}>
                    Quitar
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-12 font-display text-2xl font-semibold">Añadir</h2>
      <BlockForm today={todayInMadrid()} stylists={stylists.data ?? []} />
    </section>
  );
}
