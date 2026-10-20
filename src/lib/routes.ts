export const ROUTES = {
  home: '/',
  contacto: '/contacto',
  reservar: '/reservar',
  reservarConfirmada: '/reservar/confirmada',
  cita: '/cita', // /cita/<token>: enlace personal de la cita (ADR-0018)
  acceso: '/acceso', // enlace mágico por email (ADR-0021)
  accesoConfirmar: '/acceso/confirmar',
  misCitas: '/mis-citas',
  admin: '/admin', // panel Admin: sin enlazar desde la navegación pública (ADR-0022)
  avisoLegal: '/aviso-legal',
  privacidad: '/privacidad',
} as const;

export type Route = typeof ROUTES[keyof typeof ROUTES];
