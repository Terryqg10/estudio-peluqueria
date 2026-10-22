import Link from 'next/link';
import { requireAdmin } from '@/lib/account/require-admin';
import { ROUTES } from '@/lib/routes';
import { signOutAction } from '@/app/(cuenta)/mis-citas/actions';

const BUTTON_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control px-6 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';

// Estructura del panel (T-008a) con la agenda (T-008b). La edición de citas llega con T-008c: hasta
// entonces no hay enlaces a pantallas que no existen.
export default async function AdminPage() {
  const admin = await requireAdmin();

  return (
    <section className="mx-auto w-full max-w-3xl px-(--layout-gutter) py-12 sm:py-16">
      <h1 className="font-display text-display font-semibold">Panel de administración</h1>
      {admin.email ? <p className="mt-3 text-fg-muted">Has entrado como {admin.email}.</p> : null}

      <div className="mt-8 rounded-container bg-surface p-6 shadow-card">
        <p className="font-semibold">Tu cuenta tiene acceso de administración.</p>
        <p className="mt-2 text-fg-muted">
          Desde aquí se consulta la agenda del salón y se gestionan los servicios.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={ROUTES.adminAgenda}
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover"
          >
            Ver la agenda
          </Link>
          <Link
            href={ROUTES.adminServicios}
            className="inline-flex min-h-11 items-center justify-center rounded-control px-6 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft"
          >
            Servicios
          </Link>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap gap-2">
        <form action={signOutAction}>
          <button type="submit" className={BUTTON_CLASS}>
            Salir
          </button>
        </form>
      </div>
    </section>
  );
}
