import { ROUTES } from '@/lib/routes';

export type NavItem = {
  label: string;
  href: typeof ROUTES.home | typeof ROUTES.contacto | typeof ROUTES.misCitas;
};

// Acción principal, siempre visible en la cabecera (IMP-01). Existe desde T-005a.
export const BOOKING_CTA = { label: 'Reservar', href: ROUTES.reservar } as const;

// Cada entrada existe solo si su página existe (sin enlaces muertos).
// Las demás (Servicios, Galería, Equipo) se añaden con su tarea.
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Inicio', href: ROUTES.home },
  { label: 'Contacto', href: ROUTES.contacto },
  // Sin sesión lleva a /acceso (enlace mágico, ADR-0021).
  { label: 'Mis citas', href: ROUTES.misCitas },
];
