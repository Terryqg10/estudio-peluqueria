'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

const ITEMS = [
  { href: ROUTES.admin, label: 'Resumen' },
  { href: ROUTES.adminAgenda, label: 'Agenda' },
  { href: ROUTES.adminServicios, label: 'Servicios' },
  { href: ROUTES.adminBloqueos, label: 'Bloqueos y vacaciones' },
  { href: ROUTES.adminHorarios, label: 'Horarios' },
] as const;

const LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-3 transition-colors duration-(--duration-fast)';

// Navegación del panel (T-024). Los enlaces son reales (funcionan sin JavaScript); el componente solo marca la
// sección actual. En móvil las opciones se pliegan en filas (`flex-wrap`), sin desbordar.
export function AdminNav({ signOut }: { signOut: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Panel de administración" className="border-b border-border">
      <ul className="-ml-3 flex flex-wrap items-center gap-x-1 gap-y-1 pb-2">
        {ITEMS.map((item) => {
          const current = item.href === ROUTES.admin ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={`${LINK_CLASS} ${
                  current ? 'bg-accent-soft font-semibold text-fg' : 'text-accent-text hover:bg-accent-soft'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
        <li className="sm:ml-auto">{signOut}</li>
      </ul>
    </nav>
  );
}
