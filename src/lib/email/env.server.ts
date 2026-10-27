import { z } from 'zod';
import { parseAddress } from './address';

// Entorno del email (ADR-0017). Solo servidor: la clave de Resend nunca llega al navegador.
// Fuera de producción hay valores por defecto (Mailpit local). En producción NO los hay y
// nunca se cae a Mailpit: si falta algo, no se envía.
export type EmailEnv = {
  provider: 'mailpit' | 'resend';
  from: string;
  appUrl: string; // sin barra final; con él se construye el enlace de la cita (ADR-0018)
  mailpitUrl: string;
  resendApiKey: string | null;
};

const RawSchema = z.object({
  EMAIL_PROVIDER: z.enum(['mailpit', 'resend']).optional(),
  EMAIL_FROM: z.string().min(3).optional(),
  APP_URL: z.string().url().optional(),
  MAILPIT_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
});

const DEV_DEFAULTS = {
  provider: 'mailpit',
  from: 'Atelier Malva <reservas@atelier-malva.example>', // VERIFICAR: remitente real en producción
  appUrl: 'http://localhost:3000',
  mailpitUrl: 'http://127.0.0.1:55424',
} as const;

const stripTrailingSlash = (url: string) => url.replace(/\/+$/, '');

export function resolveEmailEnv(
  source: Record<string, string | undefined>,
  isProduction: boolean,
): EmailEnv | null {
  const parsed = RawSchema.safeParse(source);
  if (!parsed.success) return null;
  const raw = parsed.data;

  const provider = raw.EMAIL_PROVIDER ?? (isProduction ? undefined : DEV_DEFAULTS.provider);
  const from = raw.EMAIL_FROM ?? (isProduction ? undefined : DEV_DEFAULTS.from);
  const appUrl = raw.APP_URL ?? (isProduction ? undefined : DEV_DEFAULTS.appUrl);
  if (!provider || !from || !appUrl) return null;
  if (!parseAddress(from)) return null;

  if (isProduction) {
    if (provider === 'mailpit') return null; // nunca la bandeja local en producción
    if (!appUrl.startsWith('https://')) return null; // el enlace lleva un token: solo por HTTPS
  }
  if (provider === 'resend' && !raw.RESEND_API_KEY) return null;

  return {
    provider,
    from,
    appUrl: stripTrailingSlash(appUrl),
    mailpitUrl: stripTrailingSlash(raw.MAILPIT_URL ?? DEV_DEFAULTS.mailpitUrl),
    resendApiKey: raw.RESEND_API_KEY ?? null,
  };
}

// Next solo sustituye referencias literales; se listan una a una.
export function getEmailEnv(): EmailEnv | null {
  return resolveEmailEnv(
    {
      EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
      EMAIL_FROM: process.env.EMAIL_FROM,
      APP_URL: process.env.APP_URL,
      MAILPIT_URL: process.env.MAILPIT_URL,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
    },
    isStrictEnvironment(),
  );
}

// «Producción» NO se decide con NODE_ENV: la build local de pruebas (`next build` + `next start`) también
// es NODE_ENV=production y debe poder usar Mailpit. Es estricto en el despliegue real de Vercel o
// cuando se pide con EMAIL_STRICT=1 (otros alojamientos).
export function isStrictEnvironment(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.EMAIL_STRICT === '1';
}
