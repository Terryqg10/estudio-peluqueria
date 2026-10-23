// Cuenta demo de solo lectura del panel (ADR-0036, RF-13). Solo servidor: la variable no lleva prefijo NEXT_PUBLIC_.

// Email fijo y no entregable (`.invalid` está reservado): nadie puede recibir un enlace en esa dirección. La cuenta
// no tiene contraseña; solo se entra con el botón de la demo, que abre la sesión desde el servidor.
export const DEMO_EMAIL = 'cuenta-demo@demo.invalid';

// La sesión demo dura una hora desde la entrada (CA-51). Lo hace cumplir `proxy.ts` con la marca de tiempo firmada
// del propio token de acceso.
export const DEMO_SESSION_MINUTES = 60;

// Entradas por IP y ventana (VERIFICAR: acotan el abuso de una URL pública, no lo eliminan).
export const DEMO_ENTRY_LIMITS = { maxPerIp: 10, windowMinutes: 60 } as const;

// La demo solo existe con `DEMO_ENABLED=1`: sin la variable no hay botón, ni acción, ni cuenta.
export function isDemoEnabled(source: Record<string, string | undefined> = process.env): boolean {
  return source.DEMO_ENABLED === '1';
}
