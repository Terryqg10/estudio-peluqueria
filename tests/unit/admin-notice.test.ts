import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { cancelAppointmentAsAdmin, moveAppointment, type Notifier } from '@/lib/admin/manage-appointment';
import { renderChangeNotice } from '@/lib/email/templates/change-notice';

// CA-46 y CA-47 (RF-07, RF-11, ADR-0035): el Admin mueve o cancela y la clienta recibe un aviso; un fallo
// de envío no deshace la operación.
const APPT = '3f0c1d2e-8a4b-4c6d-9e1f-2a3b4c5d6e7f';
const STYLIST = '9a8b7c6d-1111-4222-8333-444455556666';
const NEW_START = '2026-11-03T10:30:00.000Z';
const OLD_RANGE = '["2026-11-02 09:00:00+00","2026-11-02 09:30:00+00")';

type Rpc = { data: unknown; error: { message: string } | null };

function fakeClient(opts: { rpcResult: Rpc; during?: string | null; selectError?: boolean }) {
  const rpc = vi.fn(async () => opts.rpcResult);
  const maybeSingle = vi.fn(async () =>
    opts.selectError
      ? { data: null, error: { message: 'x' } }
      : { data: opts.during === null ? null : { during: opts.during ?? OLD_RANGE }, error: null },
  );
  const client = { rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) };
  return { client: client as unknown as SupabaseClient<Database>, rpc };
}

const movedOk: Rpc = {
  data: [{ id: APPT, stylist_id: STYLIST, starts_at: NEW_START, ends_at: '2026-11-03T11:00:00.000Z' }],
  error: null,
};
const cancelledOk: Rpc = { data: [{ id: APPT, status: 'cancelled' }], error: null };
const slot = `${STYLIST}|${NEW_START}`;

describe('moveAppointment con aviso (CA-46, CA-47)', () => {
  it('CA-46: avisa DESPUÉS de que la BD confirme, como «rescheduled» del salón y con la fecha anterior', async () => {
    const { client, rpc } = fakeClient({ rpcResult: movedOk });
    const order: string[] = [];
    rpc.mockImplementation(async () => {
      order.push('rpc');
      return movedOk;
    });
    const notifier: Notifier = vi.fn(async () => {
      order.push('notify');
      return { ok: true };
    });

    const result = await moveAppointment(client, { appointmentId: APPT, slot }, notifier);
    expect(result).toEqual({ ok: true, date: '2026-11-03', notified: true });
    expect(order).toEqual(['rpc', 'notify']);
    expect(notifier).toHaveBeenCalledWith(APPT, 'rescheduled', {
      origin: 'salon',
      previousStartsAt: '2026-11-02T09:00:00.000Z',
    });
  });

  it('CA-47: si el envío falla (ok:false o lanza), la operación sigue siendo ok y notified es false', async () => {
    const { client } = fakeClient({ rpcResult: movedOk });
    expect(await moveAppointment(client, { appointmentId: APPT, slot }, async () => ({ ok: false }))).toEqual({
      ok: true,
      date: '2026-11-03',
      notified: false,
    });
    const boom: Notifier = async () => {
      throw new Error('boom');
    };
    expect(await moveAppointment(client, { appointmentId: APPT, slot }, boom)).toMatchObject({ ok: true, notified: false });
  });

  it('si no se puede leer la fecha anterior, el aviso sale igualmente (sin ella)', async () => {
    for (const opts of [{ during: null }, { selectError: true }] as const) {
      const { client } = fakeClient({ rpcResult: movedOk, ...opts });
      const notifier: Notifier = vi.fn(async () => ({ ok: true }));
      await moveAppointment(client, { appointmentId: APPT, slot }, notifier);
      expect(notifier).toHaveBeenCalledWith(APPT, 'rescheduled', { origin: 'salon', previousStartsAt: undefined });
    }
  });

  it.each(['NO_CHANGE', 'SLOT_TAKEN', 'INVALID_STATE', 'FORBIDDEN', 'NOT_FOUND', 'otro'])(
    'CA-47: si la BD rechaza (%s) NO se avisa a nadie',
    async (message) => {
      const { client } = fakeClient({ rpcResult: { data: null, error: { message } } });
      const notifier: Notifier = vi.fn(async () => ({ ok: true }));
      const result = await moveAppointment(client, { appointmentId: APPT, slot }, notifier);
      expect(result.ok).toBe(false);
      expect(notifier).not.toHaveBeenCalled();
    },
  );

  it('una entrada inválida no llega a la BD ni al aviso', async () => {
    const { client, rpc } = fakeClient({ rpcResult: movedOk });
    const notifier: Notifier = vi.fn(async () => ({ ok: true }));
    expect(await moveAppointment(client, { appointmentId: 'x', slot: 'y' }, notifier)).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(notifier).not.toHaveBeenCalled();
  });
});

describe('cancelAppointmentAsAdmin con aviso (CA-46, CA-47)', () => {
  it('CA-46: avisa como «cancelled» del salón tras confirmar la BD', async () => {
    const { client } = fakeClient({ rpcResult: cancelledOk });
    const notifier: Notifier = vi.fn(async () => ({ ok: true }));
    expect(await cancelAppointmentAsAdmin(client, APPT, '2026-11-02', notifier)).toEqual({
      ok: true,
      date: '2026-11-02',
      notified: true,
    });
    expect(notifier).toHaveBeenCalledWith(APPT, 'cancelled', { origin: 'salon' });
  });

  it('CA-47: un fallo del aviso no deshace la cancelación', async () => {
    const { client } = fakeClient({ rpcResult: cancelledOk });
    const result = await cancelAppointmentAsAdmin(client, APPT, '2026-11-02', async () => ({ ok: false }));
    expect(result).toEqual({ ok: true, date: '2026-11-02', notified: false });
  });

  it.each(['INVALID_STATE', 'NOT_FOUND', 'FORBIDDEN', 'otro'])('si la BD rechaza (%s) no se avisa', async (message) => {
    const { client } = fakeClient({ rpcResult: { data: null, error: { message } } });
    const notifier: Notifier = vi.fn(async () => ({ ok: true }));
    expect((await cancelAppointmentAsAdmin(client, APPT, '2026-11-02', notifier)).ok).toBe(false);
    expect(notifier).not.toHaveBeenCalled();
  });

  it('un id inválido no llega a la BD ni al aviso', async () => {
    const { client, rpc } = fakeClient({ rpcResult: cancelledOk });
    const notifier: Notifier = vi.fn(async () => ({ ok: true }));
    expect(await cancelAppointmentAsAdmin(client, 'no-es-uuid', '2026-11-02', notifier)).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(notifier).not.toHaveBeenCalled();
  });
});

describe('renderChangeNotice con origen «salon» (CA-46)', () => {
  const base = {
    salonName: 'Atelier <Malva>',
    guestName: '<b>Ana</b>',
    serviceName: 'Corte',
    stylistName: 'Irene',
    startsAt: '2026-11-03T10:30:00.000Z',
    previousStartsAt: '2026-11-02T09:00:00.000Z',
    reserveLink: 'https://salon.es/reservar',
    contactLink: 'https://salon.es/contacto',
    origin: 'salon' as const,
  };

  it('cambiada: dice que ha sido el salón, muestra la fecha anterior y la nueva, y enlaza a contacto; sin token', () => {
    const out = renderChangeNotice({ ...base, kind: 'rescheduled' });
    expect(out.subject).toContain('El salón ha cambiado');
    expect(out.text).toContain('Antes: Lunes, 2 de noviembre a las 10:00');
    expect(out.text).toContain('Hora: 11:30');
    expect(out.text).toContain('https://salon.es/contacto');
    expect(out.html).toContain('href="https://salon.es/contacto"');
    expect(out.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(out.html).not.toContain('<b>Ana</b>');
    expect(out.text).not.toContain('/cita/');
  });

  it('cancelada: dice que ha sido el salón y ofrece reservar otra; sin fecha anterior', () => {
    const out = renderChangeNotice({ ...base, kind: 'cancelled' });
    expect(out.subject).toContain('El salón ha cancelado');
    expect(out.text).toContain('el salón ha tenido que cancelar');
    expect(out.text).toContain('https://salon.es/reservar');
    expect(out.text).not.toContain('Antes:');
    expect(out.html).toContain('href="https://salon.es/reservar"');
  });

  it('sin origen (aviso de T-006d) mantiene el texto de la propia invitada y no muestra «Antes»', () => {
    const out = renderChangeNotice({ ...base, origin: undefined, kind: 'rescheduled' });
    expect(out.subject).toContain('Tu cita en');
    expect(out.text).not.toContain('Antes:');
    expect(out.text).toContain('Si no has sido tú');
  });
});
