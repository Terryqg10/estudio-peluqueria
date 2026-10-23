import { beforeEach, describe, expect, it, vi } from 'vitest';

// Se simulan la BD y el adaptador de email para probar solo la lógica de la solicitud (CA-40, CA-41).
const rpc = vi.fn();
const createServiceClient = vi.fn();
const publicRpc = vi.fn();
const createPublicClient = vi.fn();
const send = vi.fn();
const createEmailSender = vi.fn();
const getEmailEnv = vi.fn();

vi.mock('@/lib/supabase/service-client', () => ({ createServiceClient: () => createServiceClient() }));
vi.mock('@/lib/supabase/public-client', () => ({ createPublicClient: () => createPublicClient() }));
vi.mock('@/lib/email/create-sender', () => ({ createEmailSender: (env: unknown) => createEmailSender(env) }));
vi.mock('@/lib/email/env.server', () => ({
  getEmailEnv: () => getEmailEnv(),
  isStrictEnvironment: () => false,
}));

import { renderDeletionRequest } from '@/lib/email/templates/deletion-request';
import { confirmGuestDeletion } from '@/lib/privacy/confirm-guest-deletion';
import { DELETION_REQUEST_LIMITS, requestGuestDeletion } from '@/lib/privacy/request-guest-deletion';
import { DeletionEmailSchema } from '@/lib/privacy/schema';

const TOKEN = 'T'.repeat(43);

beforeEach(() => {
  rpc.mockReset().mockImplementation(async (name: string) => {
    if (name === 'request_guest_deletion') return { data: TOKEN, error: null };
    return { data: null, error: null };
  });
  createServiceClient.mockReset().mockReturnValue({ rpc });
  publicRpc.mockReset();
  createPublicClient.mockReset().mockReturnValue({ rpc: publicRpc });
  send.mockReset().mockResolvedValue({ ok: true });
  createEmailSender.mockReset().mockReturnValue({ send });
  getEmailEnv.mockReset().mockReturnValue({ appUrl: 'https://salon.example', provider: 'resend' });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('DeletionEmailSchema', () => {
  it('normaliza el email (recorta y pasa a minúsculas)', () => {
    expect(DeletionEmailSchema.parse({ email: '  Ana@Correo.COM ' }).email).toBe('ana@correo.com');
  });

  it.each(['', 'sin-arroba', 'a@b', 'a b@c.com', `${'x'.repeat(250)}@c.com`])('rechaza «%s»', (email) => {
    expect(DeletionEmailSchema.safeParse({ email }).success).toBe(false);
  });
});

describe('requestGuestDeletion (CA-40, CA-41)', () => {
  it('con un email inválido no toca la BD ni el email', async () => {
    const result = await requestGuestDeletion({ email: 'no-es-un-email' });
    expect(result).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 42, {}, { email: 42 }])('entrada con mala forma (%j) se rechaza', async (bad) => {
    expect(await requestGuestDeletion(bad)).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('con citas: consume cupo, pide el token y envía el enlace construido desde APP_URL', async () => {
    const result = await requestGuestDeletion({ email: 'Ana@Correo.com' }, { ipHash: 'i'.repeat(64) });
    expect(result).toEqual({ ok: true });

    const quota = rpc.mock.calls.find((c) => c[0] === 'consume_deletion_request_quota');
    expect(quota?.[1]).toMatchObject({
      p_ip_hash: 'i'.repeat(64),
      p_max_per_email: DELETION_REQUEST_LIMITS.maxPerEmail,
      p_max_per_ip: DELETION_REQUEST_LIMITS.maxPerIp,
      p_window_minutes: DELETION_REQUEST_LIMITS.windowMinutes,
    });
    // El cupo recibe un hash, nunca el email en claro.
    expect(JSON.stringify(quota?.[1])).not.toContain('ana@correo.com');
    expect(rpc).toHaveBeenCalledWith('request_guest_deletion', { p_email: 'ana@correo.com' });

    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]![0] as { to: string; text: string; subject: string };
    expect(message.to).toBe('ana@correo.com');
    expect(message.text).toContain(`https://salon.example/borrar-datos/confirmar?token=${TOKEN}`);
    expect(message.subject).not.toContain(TOKEN);
  });

  it('sin citas: misma respuesta y NO se envía nada', async () => {
    rpc.mockImplementation(async (name: string) => ({ data: name === 'request_guest_deletion' ? null : null, error: null }));
    expect(await requestGuestDeletion({ email: 'nadie@correo.com' })).toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['LIMIT_EMAIL', 'LIMIT_IP'])('con el cupo agotado (%s): misma respuesta y NO se pide token ni se envía', async (code) => {
    rpc.mockImplementation(async (name: string) =>
      name === 'consume_deletion_request_quota' ? { data: null, error: { message: code } } : { data: TOKEN, error: null },
    );
    expect(await requestGuestDeletion({ email: 'ana@correo.com' })).toEqual({ ok: true });
    expect(rpc).not.toHaveBeenCalledWith('request_guest_deletion', expect.anything());
    expect(send).not.toHaveBeenCalled();
  });

  it('si falla el envío o falta la configuración de email, la respuesta es la misma y el log no lleva datos', async () => {
    send.mockResolvedValue({ ok: false, reason: 'PROVIDER_ERROR' });
    expect(await requestGuestDeletion({ email: 'ana@correo.com' })).toEqual({ ok: true });

    getEmailEnv.mockReturnValue(null);
    expect(await requestGuestDeletion({ email: 'ana@correo.com' })).toEqual({ ok: true });

    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(logged).not.toContain('ana@correo.com');
    expect(logged).not.toContain(TOKEN);
  });

  it('un fallo de la BD o sin cliente es UNAVAILABLE, sin detalles', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection refused 10.0.0.1' } });
    expect(await requestGuestDeletion({ email: 'ana@correo.com' })).toEqual({ ok: false, error: 'UNAVAILABLE' });
    createServiceClient.mockReturnValue(null);
    expect(await requestGuestDeletion({ email: 'ana@correo.com' })).toEqual({ ok: false, error: 'UNAVAILABLE' });
    createServiceClient.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(await requestGuestDeletion({ email: 'ana@correo.com' })).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });
});

describe('confirmGuestDeletion (CA-40)', () => {
  it('con un token válido y la BD respondiendo un número devuelve ok', async () => {
    publicRpc.mockResolvedValue({ data: 2, error: null });
    expect(await confirmGuestDeletion(TOKEN)).toEqual({ ok: true });
    expect(publicRpc).toHaveBeenCalledWith('confirm_guest_deletion', { p_token: TOKEN });
  });

  it.each([undefined, null, 42, '', 'corto', `${TOKEN}x`, 'esto-no-es-un-token!!'])(
    'un token con mala forma (%j) se rechaza sin llegar a la BD',
    async (bad) => {
      expect(await confirmGuestDeletion(bad)).toEqual({ ok: false, error: 'INVALID_LINK' });
      expect(createPublicClient).not.toHaveBeenCalled();
    },
  );

  it('INVALID_TOKEN de la BD es INVALID_LINK; cualquier otro error o respuesta rara es UNAVAILABLE', async () => {
    publicRpc.mockResolvedValue({ data: null, error: { message: 'INVALID_TOKEN' } });
    expect(await confirmGuestDeletion(TOKEN)).toEqual({ ok: false, error: 'INVALID_LINK' });
    publicRpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await confirmGuestDeletion(TOKEN)).toEqual({ ok: false, error: 'UNAVAILABLE' });
    publicRpc.mockResolvedValue({ data: null, error: null });
    expect(await confirmGuestDeletion(TOKEN)).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });
});

describe('renderDeletionRequest', () => {
  it('el enlace va en el cuerpo y no en el asunto, y el HTML escapa el nombre', () => {
    const link = `https://salon.example/borrar-datos/confirmar?token=${TOKEN}`;
    const out = renderDeletionRequest({ salonName: 'Atelier <Malva>', link });
    expect(out.subject).not.toContain(TOKEN);
    expect(out.text).toContain(link);
    expect(out.html).toContain(link);
    expect(out.html).toContain('Atelier &lt;Malva&gt;');
    expect(out.html).not.toContain('<Malva>');
  });
});

describe('renderBookingConfirmation: enlace de borrado (T-020)', () => {
  it('incluye el enlace de borrado solo si se le pasa y lo escapa en el HTML', async () => {
    const { renderBookingConfirmation } = await import('@/lib/email/templates/booking-confirmation');
    const base = {
      salonName: 'Atelier Malva',
      guestName: 'Ana',
      serviceName: 'Corte',
      stylistName: 'Irene',
      startsAt: '2026-11-23T10:00:00.000Z',
      link: `https://salon.example/cita/${TOKEN}`,
    };
    const without = renderBookingConfirmation(base);
    expect(without.text).not.toContain('borrar-datos');

    const withLink = renderBookingConfirmation({ ...base, deleteLink: 'https://salon.example/borrar-datos?a=1&b=2' });
    expect(withLink.text).toContain('https://salon.example/borrar-datos?a=1&b=2');
    expect(withLink.html).toContain('https://salon.example/borrar-datos?a=1&amp;b=2');
  });
});
