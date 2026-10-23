import Link from 'next/link';
import { requireAdmin } from '@/lib/account/require-admin';
import { ROUTES } from '@/lib/routes';

const SECTIONS = [
  { href: ROUTES.adminAgenda, title: 'Agenda', text: 'Las citas de la semana por estilista; mover o cancelar una cita.' },
  { href: ROUTES.adminServicios, title: 'Servicios', text: 'Precios, duraciones y qué estilistas hacen cada servicio.' },
  { href: ROUTES.adminBloqueos, title: 'Bloqueos y vacaciones', text: 'Cerrar franjas o días en los que no se atiende.' },
  { href: ROUTES.adminHorarios, title: 'Horarios', text: 'Horario semanal del salón y de cada estilista.' },
] as const;

// Resumen del panel (T-008a, T-024): la navegación vive en el layout; aquí, tarjetas de cada sección.
export default async function AdminPage() {
  const admin = await requireAdmin();

  return (
    <section>
      <h1 className="font-display text-display font-semibold">Panel de administración</h1>
      {admin.email ? <p className="mt-3 text-fg-muted">Has entrado como {admin.email}.</p> : null}

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <li key={section.href} className="rounded-container bg-surface p-6 shadow-card">
            <h2 className="font-display text-2xl font-semibold">
              <Link
                href={section.href}
                className="text-accent-text transition-colors duration-(--duration-fast) hover:text-fg"
              >
                {section.title}
              </Link>
            </h2>
            <p className="mt-2 text-fg-muted">{section.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
