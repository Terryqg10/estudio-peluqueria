export const ROUTES = {
  home: '/',
  contacto: '/contacto',
  reservar: '/reservar',
  reservarConfirmada: '/reservar/confirmada',
  cita: '/cita', // /cita/<token>: enlace personal de la cita (ADR-0018)
  avisoLegal: '/aviso-legal',
  privacidad: '/privacidad',
} as const;

export type Route = typeof ROUTES[keyof typeof ROUTES];
