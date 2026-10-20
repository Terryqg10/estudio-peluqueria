import { ROUTES } from './routes';

// Lista única de páginas públicas. La usan los barridos de test (responsive,
// imágenes, accesibilidad): una página nueva se cubre al añadirla aquí (CA-37).
export const PUBLIC_PAGES = [
  ROUTES.home,
  ROUTES.contacto,
  ROUTES.reservar,
  ROUTES.reservarConfirmada, // sin cookie muestra «No encontramos tu reserva»
  `${ROUTES.cita}/${'A'.repeat(43)}`, // enlace de cita no válido (la vista válida se prueba con un token real)
  ROUTES.acceso,
  ROUTES.admin, // sin sesión redirige a /acceso (la vista de Admin se prueba con una cuenta real)
  ROUTES.misCitas, // sin sesión redirige a /acceso (la vista con sesión se prueba con una cuenta real)
  `${ROUTES.accesoConfirmar}?token_hash=${'A'.repeat(43)}`, // vista de confirmar con enlace de forma válida
] as const;
