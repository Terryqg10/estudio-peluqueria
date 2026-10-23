export const ROUTES = {
  home: '/',
  contacto: '/contacto',
  reservar: '/reservar',
  reservarConfirmada: '/reservar/confirmada',
  cita: '/cita', // /cita/<token>: enlace personal de la cita (ADR-0018)
  acceso: '/acceso', // enlace mágico por email (ADR-0021)
  accesoConfirmar: '/acceso/confirmar',
  misCitas: '/mis-citas',
  borrarDatos: '/borrar-datos', // borrado de datos por email de confirmación (ADR-0032)
  borrarDatosConfirmar: '/borrar-datos/confirmar',
  admin: '/admin', // panel Admin: sin enlazar desde la navegación pública (ADR-0022)
  adminAgenda: '/admin/agenda', // agenda semanal del Admin (T-008b)
  adminServicios: '/admin/servicios', // gestión de servicios (T-009a)
  adminBloqueos: '/admin/bloqueos', // bloqueos de franja y vacaciones (T-009b)
  adminHorarios: '/admin/horarios', // horarios semanales del salón y de las estilistas (T-009c)
  avisoLegal: '/aviso-legal',
  privacidad: '/privacidad',
} as const;

export type Route = typeof ROUTES[keyof typeof ROUTES];
