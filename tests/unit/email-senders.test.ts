import { describe, expect, it, vi } from 'vitest';
import { createEmailSender } from '@/lib/email/create-sender';
import type { EmailEnv } from '@/lib/email/env.server';
import { createMailpitSender } from '@/lib/email/mailpit-sender';
import { createResendSender } from '@/lib/email/resend-sender';
import type { EmailMessage } from '@/lib/email/types';

const message: EmailMessage = {
  to: 'ana@correo.com',
  subject: 'Tu cita',
  text: 'texto',
  html: '<p>html</p>',
};

const okResponse = () => new Response('{}', { status: 200 });

describe('adaptador de Mailpit (desarrollo)', () => {
  it('envía por la API HTTP de Mailpit con remitente, destinatario, asunto, texto y HTML', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const sender = createMailpitSender({
      baseUrl: 'http://127.0.0.1:54324',
      from: 'Atelier Malva <reservas@atelier.example>',
      fetchFn,
    });

    expect(await sender.send(message)).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:54324/api/v1/send');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      From: { Email: 'reservas@atelier.example', Name: 'Atelier Malva' },
      To: [{ Email: 'ana@correo.com' }],
      Subject: 'Tu cita',
      Text: 'texto',
      HTML: '<p>html</p>',
    });
  });

  it('un error del servidor o de red NO lanza: devuelve PROVIDER_ERROR', async () => {
    const down = createMailpitSender({
      baseUrl: 'http://x',
      from: 'a@b.com',
      fetchFn: vi.fn().mockResolvedValue(new Response('no', { status: 500 })),
    });
    expect(await down.send(message)).toEqual({ ok: false, reason: 'PROVIDER_ERROR' });

    const refused = createMailpitSender({
      baseUrl: 'http://x',
      from: 'a@b.com',
      fetchFn: vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    });
    expect(await refused.send(message)).toEqual({ ok: false, reason: 'PROVIDER_ERROR' });
  });

  it('un tiempo agotado devuelve TIMEOUT y un remitente inválido MISCONFIGURED', async () => {
    const slow = createMailpitSender({
      baseUrl: 'http://x',
      from: 'a@b.com',
      fetchFn: vi.fn().mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' })),
    });
    expect(await slow.send(message)).toEqual({ ok: false, reason: 'TIMEOUT' });

    const bad = createMailpitSender({ baseUrl: 'http://x', from: 'no-es-un-correo', fetchFn: vi.fn() });
    expect(await bad.send(message)).toEqual({ ok: false, reason: 'MISCONFIGURED' });
  });

  it('lleva un tiempo máximo (señal de cancelación)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    await createMailpitSender({ baseUrl: 'http://x', from: 'a@b.com', fetchFn }).send(message);
    expect((fetchFn.mock.calls[0] as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('adaptador de Resend (producción)', () => {
  it('envía a la API de Resend con la clave en la cabecera Authorization y sin SDK', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const sender = createResendSender({ apiKey: 'clave-de-ejemplo', from: 'Salón <hola@salon.es>', fetchFn });

    expect(await sender.send(message)).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer clave-de-ejemplo');
    expect(JSON.parse(String(init.body))).toEqual({
      from: 'Salón <hola@salon.es>',
      to: ['ana@correo.com'],
      subject: 'Tu cita',
      html: '<p>html</p>',
      text: 'texto',
    });
    // La clave solo viaja en la cabecera, nunca en el cuerpo ni en la URL.
    expect(String(init.body)).not.toContain('clave-de-ejemplo');
    expect(url).not.toContain('clave-de-ejemplo');
  });

  it('errores del proveedor, de red y tiempo agotado no lanzan', async () => {
    const make = (fetchFn: typeof fetch) => createResendSender({ apiKey: 'k', from: 'a@b.com', fetchFn });
    expect(await make(vi.fn().mockResolvedValue(new Response('no', { status: 422 }))).send(message)).toEqual({
      ok: false,
      reason: 'PROVIDER_ERROR',
    });
    expect(await make(vi.fn().mockRejectedValue(new TypeError('x'))).send(message)).toEqual({
      ok: false,
      reason: 'PROVIDER_ERROR',
    });
    expect(
      await make(vi.fn().mockRejectedValue(Object.assign(new Error('t'), { name: 'AbortError' }))).send(message),
    ).toEqual({ ok: false, reason: 'TIMEOUT' });
  });

  it('sin clave no envía nada', async () => {
    const fetchFn = vi.fn();
    expect(await createResendSender({ apiKey: '', from: 'a@b.com', fetchFn }).send(message)).toEqual({
      ok: false,
      reason: 'MISCONFIGURED',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('createEmailSender (CA-30): el proveedor se elige solo por el entorno', () => {
  const env = (over: Partial<EmailEnv>): EmailEnv => ({
    provider: 'mailpit',
    from: 'a@b.com',
    appUrl: 'http://localhost:3000',
    mailpitUrl: 'http://127.0.0.1:54324',
    resendApiKey: null,
    ...over,
  });

  it('con el mismo código, mailpit y resend llaman a destinos distintos', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    await createEmailSender(env({}), fetchFn)?.send(message);
    await createEmailSender(env({ provider: 'resend', resendApiKey: 'k' }), fetchFn)?.send(message);
    expect((fetchFn.mock.calls[0] as [string])[0]).toBe('http://127.0.0.1:54324/api/v1/send');
    expect((fetchFn.mock.calls[1] as [string])[0]).toBe('https://api.resend.com/emails');
  });

  it('Resend sin clave no devuelve adaptador', () => {
    expect(createEmailSender(env({ provider: 'resend', resendApiKey: null }))).toBeNull();
  });
});
