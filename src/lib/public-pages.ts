import { ROUTES } from './routes';

// Lista única de páginas públicas. La usan los barridos de test (responsive,
// imágenes, accesibilidad): una página nueva se cubre al añadirla aquí (CA-37).
export const PUBLIC_PAGES = [
  ROUTES.home,
  ROUTES.contacto,
  ROUTES.reservar,
  ROUTES.reservarConfirmada, // sin cookie muestra «No encontramos tu reserva»
] as const;
