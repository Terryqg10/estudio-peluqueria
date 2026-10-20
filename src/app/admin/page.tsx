import { requireAdmin } from '@/lib/account/require-admin';
import { signOutAction } from '@/app/(cuenta)/mis-citas/actions';

const BUTTON_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control px-6 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';

// Estructura del panel (T-008a). La agenda llega con T-008b y la edición de citas con T-008c: hasta
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
          Desde aquí se gestionarán la agenda y las citas del salón. Todavía no hay herramientas en el
          panel.
        </p>
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
