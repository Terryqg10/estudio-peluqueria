import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { EmailMessage, EmailSender, SendResult } from '@/lib/email/types';
import { sendBookingConfirmation, type Deps } from '@/lib/booking/send-confirmation';

// Orquestación del envío (ADR-0018). Se usa un cliente REAL de Supabase con un `fetch` simulado:
// así se prueba el comportamiento real de la librería y no hace falta ningún cast de tipos.
const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO12';
const ID = '3f0c1d2e-8a4b-4c6d-9e1f-2a3b4c5d6e7f';

type Row = {
  guest_name: string | null;
  guest_email: string | null;
  during: string;
  services: { name: string } | null;
  stylists: { name: string } | null;
};

const goodRow: Row = {
  guest_name: 'Ana García',
  guest_email: 'ana@correo.com',
  during: '["2026-11-02 09:30:00+00","2026-11-02 10:00:00+00")',
  services: { name: 'Tratamiento hidratante' },
  stylists: { name: 'Irene Solís' },
};

type Call = { method: string; path: string; body: string | null };

const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function fakeSupabase(opts: { row?: Row | null; token?: string | null; updateError?: boolean }) {
  const calls: Call[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href);
    const method = init?.method ?? 'GET';
    calls.push({ method, path: url.pathname, body: init?.body ? String(init.body) : null });

    if (url.pathname.endsWith('/rpc/issue_management_token')) {
      return opts.token === null ? json(400, { message: 'fallo' }) : json(200, opts.token ?? TOKEN);
    }
    if (url.pathname.endsWith('/appointments') && method === 'GET') {
      const row = opts.row === undefined ? goodRow : opts.row;
      return json(200, row ? [row] : []);
    }
    if (url.pathname.endsWith('/appointments') && method === 'PATCH') {
      return opts.updateError ? json(500, { message: 'fallo' }) : json(204, null);
    }
    return json(404, { message: 'ruta no simulada' });
  };

  const client = createClient<Database>('http://localhost:54321', 'clave-de-prueba', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchFn },
  });
  const count = (suffix: string, method?: string) =>
    calls.filter((c) => c.path.endsWith(suffix) && (!method || c.method === method)).length;
  return {
    client,
    calls,
    tokensIssued: () => count('/rpc/issue_management_token'),
    marksWritten: () => count('/appointments', 'PATCH'),
  };
}

function fakeSender(result: SendResult | 'throw'): { sender: EmailSender; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(async (message: EmailMessage): Promise<SendResult> => {
    void message;
    if (result === 'throw') throw new Error('proveedor caído');
    return result;
  });
  return { sender: { send }, send };
}

const deps = (client: Deps['client'], sender: Deps['sender'], appUrl: Deps['appUrl'] = 'http://localhost:3000'): Deps => ({
  client,
  sender,
  appUrl,
});

describe('sendBookingConfirmation (ADR-0018)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errorSpy.mockRestore());

  it('emite el token, envía el enlace {APP_URL}/cita/<token> y marca el envío', async () => {
    const db = fakeSupabase({});
    const { sender, send } = fakeSender({ ok: true });

    const result = await sendBookingConfirmation(ID, deps(db.client, sender, 'https://salon.es'));

    expect(result).toEqual({ ok: true });
    expect(db.tokensIssued()).toBe(1);
    expect(db.calls.find((c) => c.path.endsWith('/rpc/issue_management_token'))?.body).toContain(ID);
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0]?.[0] as EmailMessage;
    expect(sent.to).toBe('ana@correo.com');
    expect(sent.text).toContain(`https://salon.es/cita/${TOKEN}`);
    expect(sent.subject).not.toContain(TOKEN);
    expect(db.marksWritten()).toBe(1);
    expect(db.calls.find((c) => c.method === 'PATCH')?.body).toContain('confirmation_email_sent_at');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('si el proveedor falla, devuelve el motivo, NO marca el envío y no lanza (la cita se mantiene)', async () => {
    const db = fakeSupabase({});
    const { sender } = fakeSender({ ok: false, reason: 'PROVIDER_ERROR' });
    const result = await sendBookingConfirmation(ID, deps(db.client, sender));
    expect(result).toEqual({ ok: false, reason: 'PROVIDER_ERROR' });
    expect(db.marksWritten()).toBe(0);
    expect(db.calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('si el proveedor lanza una excepción, tampoco se propaga', async () => {
    const db = fakeSupabase({});
    const { sender } = fakeSender('throw');
    await expect(sendBookingConfirmation(ID, deps(db.client, sender))).resolves.toEqual({
      ok: false,
      reason: 'UNEXPECTED',
    });
  });

  it('tiempo agotado: se devuelve TIMEOUT', async () => {
    const db = fakeSupabase({});
    const { sender } = fakeSender({ ok: false, reason: 'TIMEOUT' });
    expect(await sendBookingConfirmation(ID, deps(db.client, sender))).toEqual({ ok: false, reason: 'TIMEOUT' });
  });

  it.each([
    ['sin cliente de BD', 'client'],
    ['sin adaptador de email', 'sender'],
    ['sin APP_URL', 'appUrl'],
  ])('NOT_CONFIGURED %s: no se emite token ni se envía', async (_name, missing) => {
    const db = fakeSupabase({});
    const { sender, send } = fakeSender({ ok: true });
    const result = await sendBookingConfirmation(ID, {
      client: missing === 'client' ? null : db.client,
      sender: missing === 'sender' ? null : sender,
      appUrl: missing === 'appUrl' ? null : 'http://localhost:3000',
    });
    expect(result).toEqual({ ok: false, reason: 'NOT_CONFIGURED' });
    expect(send).not.toHaveBeenCalled();
    expect(db.tokensIssued()).toBe(0);
  });

  it('cita inexistente o incompleta: NOT_FOUND sin emitir token', async () => {
    const incompletes: (Row | null)[] = [null, { ...goodRow, guest_email: null }, { ...goodRow, services: null }];
    for (const row of incompletes) {
      const db = fakeSupabase({ row });
      const { sender, send } = fakeSender({ ok: true });
      const result = await sendBookingConfirmation(ID, deps(db.client, sender));
      expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
      expect(db.tokensIssued()).toBe(0);
      expect(send).not.toHaveBeenCalled();
    }
  });

  it('si no se puede emitir el token, no se envía nada', async () => {
    const db = fakeSupabase({ token: null });
    const { sender, send } = fakeSender({ ok: true });
    expect(await sendBookingConfirmation(ID, deps(db.client, sender))).toEqual({
      ok: false,
      reason: 'TOKEN_FAILED',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('si el email salió pero no se pudo marcar, se registra y se considera enviado', async () => {
    const db = fakeSupabase({ updateError: true });
    const { sender } = fakeSender({ ok: true });
    expect(await sendBookingConfirmation(ID, deps(db.client, sender))).toEqual({ ok: true });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('el registro de fallos solo lleva el id de la cita y el motivo: nunca email, nombre, token ni enlace', async () => {
    const db = fakeSupabase({});
    const { sender } = fakeSender({ ok: false, reason: 'PROVIDER_ERROR' });
    await sendBookingConfirmation(ID, deps(db.client, sender));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain(ID);
    expect(logged).toContain('PROVIDER_ERROR');
    for (const secret of ['ana@correo.com', 'Ana García', TOKEN, '/cita/']) {
      expect(logged).not.toContain(secret);
    }
  });
});
