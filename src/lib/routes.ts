export const ROUTES = {
  home: '/',
  contacto: '/contacto',
  reservar: '/reservar',
  avisoLegal: '/aviso-legal',
  privacidad: '/privacidad',
} as const;

export type Route = typeof ROUTES[keyof typeof ROUTES];
