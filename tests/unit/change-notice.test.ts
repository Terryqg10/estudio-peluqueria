import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { EmailMessage, EmailSender, SendResult } from '@/lib/email/types';
import { renderChangeNotice } from '@/lib/email/templates/change-notice';

// Mocks del cliente público para probar `onDone` de cancelar y cambiar (T-006d).
const publicRpc = vi.fn();
vi.mock('@/lib/supabase/public-client', () => ({ createPublicClient: () => ({ rpc: publicRpc }) }));

import { cancelAppointment } from '@/lib/booking/cancel-appointment';
import { rescheduleAppointment } from '@/lib/booking/reschedule-appointment';
import { sendChangeNotice, type ChangeNoticeDeps } from '@/lib/booking/send-change-notice';

// CA-42 y CA-43 (RF-05, RF-11, ADR-0033). Se usa un cliente REAL de Supabase con un `fetch` simulado.
const ID = '3f0c1d2e-8a4b-4c6d-9e1f-2a3b4c5d6e7f';
const TOKEN = 'T'.repeat(43);

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

function fakeSupabase(row: Row | null = goodRow) {
  const calls: { method: string; path: string }[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href);
    calls.push({ method: init?.method ?? 'GET', path: url.pathname });
    if (url.pathname.endsWith('/appointments') && (init?.method ?? 'GET') === 'GET') {
      return new Response(JSON.stringify(row ? [row] : []), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ message: 'ruta no simulada' }), { status: 404 });
  };
  const client = createClient<Database>('http://localhost:54321', 'clave-de-prueba', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchFn },
  });
  return { client, calls };
}

function fakeSender(result: SendResult | 'throw') {
  const send = vi.fn(async (message: EmailMessage): Promise<SendResult> => {
    void message;
    if (result === 'throw') throw new Error('proveedor caído');
    return result;
  });
  return { sender: { send } satisfies EmailSender, send };
}

const deps = (
  client: ChangeNoticeDeps['client'],
  sender: ChangeNoticeDeps['sender'],
  appUrl: ChangeNoticeDeps['appUrl'] = 'https://salon.es',
): ChangeNoticeDeps => ({ client, sender, appUrl });

describe('sendChangeNotice (CA-42, CA-43)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errorSpy.mockRestore());

  it('CA-42 cancelada: envía a la invitada con el resumen y el enlace a /reservar, sin emitir token', async () => {
    const db = fakeSupabase();
    const { sender, send } = fakeSender({ ok: true });
    expect(await sendChangeNotice(ID, 'cancelled', deps(db.client, sender))).toEqual({ ok: true });

    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]![0];
    expect(message.to).toBe('ana@correo.com');
    expect(message.subject).toContain('cancelada');
    expect(message.text).toContain('Irene Solís');
    expect(message.text).toContain('https://salon.es/reservar');
    // No se emite ningún token (invalidaría el enlace del correo anterior) ni se escribe nada.
    expect(db.calls.some((c) => c.path.includes('issue_management_token'))).toBe(false);
    expect(db.calls.every((c) => c.method === 'GET')).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('CA-42 cambiada: el aviso lleva el nuevo día y hora y recuerda que el enlace sigue valiendo', async () => {
    const db = fakeSupabase();
    const { sender, send } = fakeSender({ ok: true });
    await sendChangeNotice(ID, 'rescheduled', deps(db.client, sender));
    const message = send.mock.calls[0]![0];
    expect(message.subject).toContain('ha cambiado');
    expect(message.text).toContain('10:30');
    expect(message.text).toContain('mismo enlace');
  });

  it('CA-43: si el proveedor falla o lanza, devuelve el motivo sin propagar y el log no lleva datos personales', async () => {
    for (const [sender, expected] of [
      [fakeSender({ ok: false, reason: 'PROVIDER_ERROR' }).sender, { ok: false, reason: 'PROVIDER_ERROR' }],
      [fakeSender({ ok: false, reason: 'TIMEOUT' }).sender, { ok: false, reason: 'TIMEOUT' }],
      [fakeSender('throw').sender, { ok: false, reason: 'UNEXPECTED' }],
    ] as const) {
      expect(await sendChangeNotice(ID, 'cancelled', deps(fakeSupabase().client, sender))).toEqual(expected);
    }
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain('ana@correo.com');
    expect(logged).not.toContain('Ana');
    expect(logged).toContain(ID);
  });

  it.each([
    ['sin cliente de BD', { client: null }],
    ['sin adaptador de email', { sender: null }],
    ['sin APP_URL', { appUrl: null }],
  ])('CA-43: %s → NOT_CONFIGURED sin lanzar', async (_name, override) => {
    const { sender } = fakeSender({ ok: true });
    const base = deps(fakeSupabase().client, sender);
    expect(await sendChangeNotice(ID, 'cancelled', { ...base, ...override })).toEqual({
      ok: false,
      reason: 'NOT_CONFIGURED',
    });
  });

  it.each([
    ['cita inexistente', null],
    ['sin email', { ...goodRow, guest_email: null }],
    ['sin nombre (cita anonimizada)', { ...goodRow, guest_name: null }],
    ['sin servicio', { ...goodRow, services: null }],
  ])('%s → NOT_FOUND y no se envía nada', async (_name, row) => {
    const { sender, send } = fakeSender({ ok: true });
    expect(await sendChangeNotice(ID, 'cancelled', deps(fakeSupabase(row).client, sender))).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('renderChangeNotice', () => {
  const base = {
    salonName: 'Atelier <Malva>',
    guestName: '<b>Ana</b>',
    serviceName: 'Corte',
    stylistName: 'Irene',
    startsAt: '2026-11-02T09:30:00.000Z',
    reserveLink: 'https://salon.es/reservar',
  };

  it('escapa lo escrito por personas en el HTML y no lleva datos sensibles en el asunto', () => {
    for (const kind of ['cancelled', 'rescheduled'] as const) {
      const out = renderChangeNotice({ ...base, kind });
      expect(out.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
      expect(out.html).not.toContain('<b>Ana</b>');
      expect(out.subject).not.toContain('Ana');
    }
  });

  it('solo la cancelación ofrece reservar otra cita', () => {
    expect(renderChangeNotice({ ...base, kind: 'cancelled' }).html).toContain('href="https://salon.es/reservar"');
    expect(renderChangeNotice({ ...base, kind: 'rescheduled' }).html).not.toContain('href=');
  });
});

describe('onDone de cancelar y cambiar (T-006d)', () => {
  beforeEach(() => publicRpc.mockReset());

  it('se llama con el id solo después de que la BD confirme, y el resultado no lo incluye', async () => {
    publicRpc.mockResolvedValue({ data: [{ id: ID, status: 'cancelled' }], error: null });
    const onDone = vi.fn().mockResolvedValue(undefined);
    expect(await cancelAppointment(TOKEN, onDone)).toEqual({ ok: true });
    expect(onDone).toHaveBeenCalledWith(ID);

    publicRpc.mockResolvedValue({ data: [{ id: ID }], error: null });
    const onDone2 = vi.fn().mockResolvedValue(undefined);
    expect(await rescheduleAppointment({ token: TOKEN, stylistId: ID, startsAt: '2026-11-02T10:00:00Z' }, onDone2)).toEqual({ ok: true });
    expect(onDone2).toHaveBeenCalledWith(ID);
  });

  it('NO se llama si la operación falla (menos de 24 h, enlace inválido, hueco ocupado, sin cambio…)', async () => {
    const onDone = vi.fn();
    for (const message of ['TOO_LATE', 'INVALID_TOKEN', 'SLOT_TAKEN', 'NO_CHANGE', 'otro']) {
      publicRpc.mockResolvedValue({ data: null, error: { message } });
      await cancelAppointment(TOKEN, onDone);
      await rescheduleAppointment({ token: TOKEN, stylistId: ID, startsAt: '2026-11-02T10:00:00Z' }, onDone);
    }
    await cancelAppointment('mal-formado', onDone);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('CA-43: si onDone lanza, el resultado sigue siendo ok', async () => {
    publicRpc.mockResolvedValue({ data: [{ id: ID, status: 'cancelled' }], error: null });
    const boom = vi.fn().mockRejectedValue(new Error('boom'));
    expect(await cancelAppointment(TOKEN, boom)).toEqual({ ok: true });
    publicRpc.mockResolvedValue({ data: [{ id: ID }], error: null });
    expect(await rescheduleAppointment({ token: TOKEN, stylistId: ID, startsAt: '2026-11-02T10:00:00Z' }, boom)).toEqual({ ok: true });
  });
});
