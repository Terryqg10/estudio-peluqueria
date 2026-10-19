import { ROUTES } from '@/lib/routes';

export type NavItem = {
  label: string;
  href: typeof ROUTES.home | typeof ROUTES.contacto;
};

// Cada entrada existe solo si su página existe (sin enlaces muertos).
// Las demás (Servicios, Galería, Equipo, Reservar) se añaden con su tarea.
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Inicio', href: ROUTES.home },
  { label: 'Contacto', href: ROUTES.contacto },
];
