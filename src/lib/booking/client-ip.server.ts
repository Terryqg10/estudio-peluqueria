import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
import { isStrictEnvironment } from '@/lib/email/env.server';

// Hash de la IP del visitante para el límite por IP (ADR-0020, spec sección 9). Solo servidor: la
// IP nunca se guarda en claro; se guarda HMAC-SHA256 con una sal secreta, y el registro caduca en
// horas (lo hace `create_booking`).
const RawSchema = z.object({
  RATE_LIMIT_SALT: z.string().min(16).optional(),
  RATE_LIMIT_IP_ENFORCE: z.string().optional(),
});

// Solo fuera de producción: con la IP de desarrollo todos los e2e comparten cubo.
const DEV_SALT = 'sal-solo-para-desarrollo-local';

export type IpHashResult =
  | { ok: true; ipHash: string | null } // null = no se aplica el límite por IP
  | { ok: false }; // configuración inválida en producción: se falla cerrado

type Source = Record<string, string | undefined>;
type RequestHeaders = { get(name: string): string | null };

// La IP la fija la plataforma (en Vercel, `x-real-ip` y el primer valor de `x-forwarded-for` son la
// del cliente y no se pueden falsear). VERIFICAR si se aloja en otro sitio que añada valores.
function clientIp(headers: RequestHeaders): string | null {
  const candidates = [headers.get('x-real-ip'), headers.get('x-forwarded-for')?.split(',')[0]];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value && isIP(value) !== 0) return value;
  }
  return null;
}

export function resolveClientIpHash(source: Source, headers: RequestHeaders, strict: boolean): IpHashResult {
  const parsed = RawSchema.safeParse(source);
  if (!parsed.success) return { ok: false };
  const raw = parsed.data;

  // Fuera de producción el límite por IP está apagado salvo que se pida: todos los e2e reservan
  // desde la misma IP y lo agotarían. En producción siempre está activo.
  const enforce = strict || raw.RATE_LIMIT_IP_ENFORCE === '1';
  if (!enforce) return { ok: true, ipHash: null };

  const salt = raw.RATE_LIMIT_SALT ?? (strict ? undefined : DEV_SALT);
  if (!salt) return { ok: false };

  // Sin IP identificable, un cubo común y conservador (no se deja pasar sin límite).
  const ip = clientIp(headers) ?? 'desconocida';
  return { ok: true, ipHash: createHmac('sha256', salt).update(ip).digest('hex') };
}

// Hash con sal de una clave que no debe guardarse en claro (p. ej. el email del cupo de envíos del
// acceso, ADR-0021). Fuera de producción usa la sal de desarrollo; en producción sin sal, null.
export function hashWithSalt(source: Source, strict: boolean, value: string): string | null {
  const parsed = RawSchema.safeParse(source);
  if (!parsed.success) return null;
  const salt = parsed.data.RATE_LIMIT_SALT ?? (strict ? undefined : DEV_SALT);
  if (!salt) return null;
  return createHmac('sha256', salt).update(value).digest('hex');
}

export function getKeyHash(value: string): string | null {
  return hashWithSalt(
    { RATE_LIMIT_SALT: process.env.RATE_LIMIT_SALT, RATE_LIMIT_IP_ENFORCE: process.env.RATE_LIMIT_IP_ENFORCE },
    isStrictEnvironment(),
    value,
  );
}

export function getClientIpHash(headers: RequestHeaders): IpHashResult {
  return resolveClientIpHash(
    {
      RATE_LIMIT_SALT: process.env.RATE_LIMIT_SALT,
      RATE_LIMIT_IP_ENFORCE: process.env.RATE_LIMIT_IP_ENFORCE,
    },
    headers,
    isStrictEnvironment(),
  );
}
