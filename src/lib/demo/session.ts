import { DEMO_EMAIL, DEMO_SESSION_MINUTES } from './config';

type AuthenticationMethod = { method?: unknown; timestamp?: unknown };

// Datos mínimos de las claims de un token de acceso ya validado.
export type SessionClaims = { email?: unknown; amr?: unknown };

// ¿Es una sesión de la cuenta demo que ya pasó de su hora? La marca de tiempo es la de la autenticación inicial
// (`amr[].timestamp`, en segundos): va dentro del token firmado, no se renueva al refrescarlo y no se puede alargar
// desde el navegador. Una sesión demo sin marca se considera caducada (falla cerrado). Las demás cuentas nunca caducan aquí.
export function isDemoSessionExpired(claims: SessionClaims, nowMs: number): boolean {
  if (claims.email !== DEMO_EMAIL) return false;

  const methods: AuthenticationMethod[] = Array.isArray(claims.amr) ? (claims.amr as AuthenticationMethod[]) : [];
  const stamps = methods
    .map((m) => m.timestamp)
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  if (stamps.length === 0) return true;

  const startedMs = Math.min(...stamps) * 1000;
  return nowMs - startedMs >= DEMO_SESSION_MINUTES * 60_000;
}
