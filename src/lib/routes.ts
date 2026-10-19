export const ROUTES = {
  home: '/',
  contacto: '/contacto',
  reservar: '/reservar',
  reservarConfirmada: '/reservar/confirmada',
  avisoLegal: '/aviso-legal',
  privacidad: '/privacidad',
} as const;

export type Route = typeof ROUTES[keyof typeof ROUTES];
