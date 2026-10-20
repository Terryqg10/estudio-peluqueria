import { beforeEach, describe, expect, it, vi } from 'vitest';

// Se simulan la BD y Auth para probar solo la lógica de requestLoginLink (ADR-0021).
const rpc = vi.fn();
const signInWithOtp = vi.fn();
const createServiceClient = vi.fn();
const createPublicClient = vi.fn();

vi.mock('@/lib/supabase/service-client', () => ({ createServiceClient: () => createServiceClient() }));
vi.mock('@/lib/supabase/public-client', () => ({ createPublicClient: () => createPublicClient() }));

import { LOGIN_LINK_LIMITS, requestLoginLink } from '@/lib/account/request-login-link';
import { LoginEmailSchema, TokenHashSchema } from '@/lib/account/schema';

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null });
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
  createServiceClient.mockReset().mockReturnValue({ rpc });
  createPublicClient.mockReset().mockReturnValue({ auth: { signInWithOtp } });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('LoginEmailSchema', () => {
  it('normaliza el email (recorta y pasa a minúsculas)', () => {
    expect(LoginEmailSchema.parse({ email: '  Ana@Correo.COM ' }).email).toBe('ana@correo.com');
  });

  it.each(['', 'sin-arroba', 'a@b', 'a b@c.com', `${'x'.repeat(250)}@c.com`])('rechaza «%s»', (email) => {
    expect(LoginEmailSchema.safeParse({ email }).success).toBe(false);
  });
});

describe('TokenHashSchema', () => {
  it('acepta un hash URL-safe y rechaza formas raras', () => {
    expect(TokenHashSchema.safeParse('pkce_AbC-123_xyz').success).toBe(true);
    for (const bad of ['', 'corto', 'con espacio aaaa', 'a/b/c/d/e/f/g', '<script>alert(1)</script>', 'x'.repeat(257), 42, null]) {
      expect(TokenHashSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('requestLoginLink', () => {
  it('con un email inválido no toca la BD ni Auth y devuelve el mensaje del campo', async () => {
    const result = await requestLoginLink({ email: 'no-es-email' });
    expect(result).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect(rpc).not.toHaveBeenCalled();
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('con un email válido consume cupo con claves en hash (nunca el email) y pide el enlace', async () => {
    const result = await requestLoginLink({ email: 'Ana@Correo.com' }, { ipHash: 'a'.repeat(64) });
    expect(result).toEqual({ ok: true });

    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(rpc.mock.calls[0]?.[0]).toBe('consume_login_link_quota');
    expect(String(args.p_email_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain('ana@correo.com');
    expect(args).toMatchObject({
      p_ip_hash: 'a'.repeat(64),
      p_max_per_email: LOGIN_LINK_LIMITS.maxPerEmail,
      p_max_per_ip: LOGIN_LINK_LIMITS.maxPerIp,
      p_window_minutes: LOGIN_LINK_LIMITS.windowMinutes,
    });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'ana@correo.com',
      options: { shouldCreateUser: true },
    });
  });

  it('sin hash de IP no envía p_ip_hash', async () => {
    await requestLoginLink({ email: 'ana@correo.com' });
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('p_ip_hash');
  });

  it.each(['LIMIT_EMAIL', 'LIMIT_IP'])(
    'con %s responde igual que un éxito pero NO envía el enlace (sin enumeración)',
    async (code) => {
      rpc.mockResolvedValue({ error: { message: code } });
      const result = await requestLoginLink({ email: 'ana@correo.com' });
      expect(result).toEqual({ ok: true });
      expect(signInWithOtp).not.toHaveBeenCalled();
    },
  );

  it('el mismo resultado exista o no la cuenta: Auth no distingue y la respuesta es idéntica', async () => {
    const first = await requestLoginLink({ email: 'existe@correo.com' });
    const second = await requestLoginLink({ email: 'nueva@correo.com' });
    expect(first).toEqual(second);
  });

  it('si la BD del cupo falla, no envía y devuelve UNAVAILABLE', async () => {
    rpc.mockResolvedValue({ error: { message: 'boom' } });
    expect(await requestLoginLink({ email: 'ana@correo.com' })).toEqual({ ok: false, error: 'UNAVAILABLE' });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('el intervalo mínimo de Auth entre correos se responde como éxito (no distingue direcciones)', async () => {
    signInWithOtp.mockResolvedValue({ error: { code: 'over_email_send_rate_limit', status: 429 } });
    expect(await requestLoginLink({ email: 'ana@correo.com' })).toEqual({ ok: true });
  });

  it('si Auth falla devuelve UNAVAILABLE y no filtra el detalle', async () => {
    signInWithOtp.mockResolvedValue({ error: { code: 'unexpected_failure', message: 'secreto interno' } });
    const result = await requestLoginLink({ email: 'ana@correo.com' });
    expect(result).toEqual({ ok: false, error: 'UNAVAILABLE' });
    expect(JSON.stringify(result)).not.toContain('secreto');
  });

  it('sin cliente de servicio o sin Auth configurado, UNAVAILABLE', async () => {
    createServiceClient.mockReturnValue(null);
    expect(await requestLoginLink({ email: 'ana@correo.com' })).toEqual({ ok: false, error: 'UNAVAILABLE' });

    createServiceClient.mockReturnValue({ rpc });
    createPublicClient.mockReturnValue(null);
    expect(await requestLoginLink({ email: 'ana@correo.com' })).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });
});
