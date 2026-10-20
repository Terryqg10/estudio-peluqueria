import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAddress } from '@/lib/email/address';
import { isStrictEnvironment, resolveEmailEnv } from '@/lib/email/env.server';

describe('resolveEmailEnv (ADR-0017)', () => {
  it('fuera de producción funciona sin configurar nada (Mailpit local)', () => {
    expect(resolveEmailEnv({}, false)).toEqual({
      provider: 'mailpit',
      from: 'Atelier Malva <reservas@atelier-malva.example>',
      appUrl: 'http://localhost:3000',
      mailpitUrl: 'http://127.0.0.1:54424',
      resendApiKey: null,
    });
  });

  it('respeta lo configurado y quita la barra final de las URL', () => {
    const env = resolveEmailEnv(
      { APP_URL: 'http://localhost:3100/', MAILPIT_URL: 'http://127.0.0.1:9999//', EMAIL_FROM: 'a@b.com' },
      false,
    );
    expect(env?.appUrl).toBe('http://localhost:3100');
    expect(env?.mailpitUrl).toBe('http://127.0.0.1:9999');
    expect(env?.from).toBe('a@b.com');
  });

  it('CA-30: cambiar de proveedor es solo cambiar variables', () => {
    const resend = resolveEmailEnv(
      { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'clave-de-ejemplo', EMAIL_FROM: 'Salón <hola@salon.es>', APP_URL: 'https://salon.es' },
      true,
    );
    expect(resend?.provider).toBe('resend');
    expect(resend?.resendApiKey).toBe('clave-de-ejemplo');
  });

  describe('en producción no hay valores por defecto', () => {
    const base = {
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 'k',
      EMAIL_FROM: 'Salón <hola@salon.es>',
      APP_URL: 'https://salon.es',
    };

    it('con todo configurado funciona', () => {
      expect(resolveEmailEnv(base, true)).not.toBeNull();
    });

    it.each(['EMAIL_PROVIDER', 'EMAIL_FROM', 'APP_URL', 'RESEND_API_KEY'])('si falta %s, no se envía', (key) => {
      const source: Record<string, string | undefined> = { ...base };
      delete source[key];
      expect(resolveEmailEnv(source, true)).toBeNull();
    });

    it('nunca se cae a Mailpit: ni por defecto ni configurado', () => {
      expect(resolveEmailEnv({ ...base, EMAIL_PROVIDER: 'mailpit' }, true)).toBeNull();
    });

    it('APP_URL debe ser https (el enlace lleva un token)', () => {
      expect(resolveEmailEnv({ ...base, APP_URL: 'http://salon.es' }, true)).toBeNull();
    });
  });

  it('rechaza un remitente inválido, un proveedor desconocido y Resend sin clave', () => {
    expect(resolveEmailEnv({ EMAIL_FROM: 'no-es-un-correo' }, false)).toBeNull();
    expect(resolveEmailEnv({ EMAIL_PROVIDER: 'sendgrid' }, false)).toBeNull();
    expect(resolveEmailEnv({ EMAIL_PROVIDER: 'resend' }, false)).toBeNull();
  });
});

describe('isStrictEnvironment', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('es estricto en el despliegue de producción de Vercel o con EMAIL_STRICT=1, no por NODE_ENV', () => {
    vi.stubEnv('NODE_ENV', 'production'); // la build local de pruebas también lo es
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('EMAIL_STRICT', '');
    expect(isStrictEnvironment()).toBe(false);

    vi.stubEnv('VERCEL_ENV', 'production');
    expect(isStrictEnvironment()).toBe(true);

    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(isStrictEnvironment()).toBe(false);

    vi.stubEnv('EMAIL_STRICT', '1');
    expect(isStrictEnvironment()).toBe(true);
  });
});

describe('parseAddress', () => {
  it.each([
    ['ana@correo.com', { email: 'ana@correo.com' }],
    ['Ana García <ana@correo.com>', { name: 'Ana García', email: 'ana@correo.com' }],
    ['"Salón Malva" <hola@salon.es>', { name: 'Salón Malva', email: 'hola@salon.es' }],
    ['<ana@correo.com>', { email: 'ana@correo.com' }],
  ])('«%s» es válido', (value, expected) => {
    expect(parseAddress(value)).toEqual(expected);
  });

  it.each(['', 'ana', 'ana@', '@correo.com', 'Ana <ana>', 'a na@correo.com'])('«%s» no es válido', (value) => {
    expect(parseAddress(value)).toBeNull();
  });
});
