import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/account/require-admin';

// Todo `/admin` es privado: no se indexa y se renderiza en cada petición (nunca estático ni en caché).
export const metadata: Metadata = {
  title: { default: 'Panel de administración', template: '%s · Panel de administración' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// Primera barrera (ADR-0022). Un layout no se vuelve a ejecutar al navegar entre páginas hijas, así que
// cada página y cada acción de servidor del panel llaman también a `requireAdmin()`.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
