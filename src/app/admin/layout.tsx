import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/account/require-admin';
import { signOutAction } from '@/app/(cuenta)/mis-citas/actions';
import { AdminNav } from './admin-nav';

// Todo `/admin` es privado: no se indexa y se renderiza en cada petición (nunca estático ni en caché).
export const metadata: Metadata = {
  title: { default: 'Panel de administración', template: '%s · Panel de administración' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// Primera barrera (ADR-0022). Un layout no se vuelve a ejecutar al navegar entre páginas hijas, así que
// cada página y cada acción de servidor del panel llaman también a `requireAdmin()`.
// Contenedor alineado con la cabecera y el pie (`max-w-6xl`) y navegación propia del panel (T-024).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto w-full max-w-6xl px-(--layout-gutter) pb-12 pt-6 sm:pb-16">
      <AdminNav
        signOut={
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-control px-3 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft"
            >
              Salir
            </button>
          </form>
        }
      />
      <div className="pt-8">{children}</div>
    </div>
  );
}
