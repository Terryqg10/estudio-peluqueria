import { beforeEach, describe, expect, it, vi } from 'vitest';

// Se simula el cliente público para probar solo la validación y la traducción de errores.
const rpc = vi.fn();
const createPublicClient = vi.fn();
vi.mock('@/lib/supabase/public-client', () => ({ createPublicClient: () => createPublicClient() }));

import { loadRescheduleAvailability, rescheduleAppointment } from '@/lib/booking/reschedule-appointment';

const token = 'A'.repeat(43);
const uuid = '3f0c1d2e-8a4b-4c6d-9e1f-2a3b4c5d6e7f';
const valid = { token, stylistId: uuid, startsAt: '2026-11-02T17:00:00.000Z' };

beforeEach(() => {
  rpc.mockReset();
  createPublicClient.mockReset();
  createPublicClient.mockReturnValue({ rpc });
});

describe('rescheduleAppointment', () => {
  it('con datos válidos llama a la función de BD y devuelve ok', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'x' }], error: null });
    expect(await rescheduleAppointment(valid)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('reschedule_guest_appointment', {
      p_token: token,
      p_stylist_id: uuid,
      p_starts_at: valid.startsAt,
    });
  });

  it.each([
    ['token con mala forma', { ...valid, token: 'corto' }, 'INVALID_LINK'],
    ['sin token', { stylistId: uuid, startsAt: valid.startsAt }, 'INVALID_LINK'],
    ['estilista que no es uuid', { ...valid, stylistId: 'x' }, 'INVALID_INPUT'],
    ['fecha que no es ISO', { ...valid, startsAt: 'mañana' }, 'INVALID_INPUT'],
    ['entrada que no es objeto', null, 'INVALID_LINK'],
  ])('%s se rechaza sin llegar a la BD', async (_name, input, error) => {
    expect(await rescheduleAppointment(input)).toEqual({ ok: false, error });
    expect(createPublicClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['INVALID_TOKEN', 'INVALID_LINK'],
    ['TOO_LATE', 'TOO_LATE'],
    ['SLOT_TAKEN', 'SLOT_TAKEN'],
    ['OUT_OF_WINDOW', 'OUT_OF_WINDOW'],
    ['NO_CHANGE', 'NO_CHANGE'],
    ['INVALID_SELECTION', 'INVALID_INPUT'],
    ['connection refused 10.0.0.1', 'UNAVAILABLE'],
  ])('el error de BD «%s» se traduce a %s', async (message, expected) => {
    rpc.mockResolvedValue({ data: null, error: { message } });
    expect(await rescheduleAppointment(valid)).toEqual({ ok: false, error: expected });
  });

  it('sin fila, sin cliente o con la llamada lanzando devuelve UNAVAILABLE', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await rescheduleAppointment(valid)).toEqual({ ok: false, error: 'UNAVAILABLE' });
    createPublicClient.mockReturnValue(null);
    expect(await rescheduleAppointment(valid)).toEqual({ ok: false, error: 'UNAVAILABLE' });
    createPublicClient.mockReturnValue({ rpc });
    rpc.mockRejectedValue(new Error('boom'));
    expect(await rescheduleAppointment(valid)).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });
});

describe('loadRescheduleAvailability', () => {
  it('devuelve los huecos en ISO UTC', async () => {
    rpc.mockResolvedValue({
      data: [{ stylist_id: uuid, starts_at: '2026-11-02T17:00:00+00:00' }],
      error: null,
    });
    expect(await loadRescheduleAvailability({ token, date: '2026-11-02' })).toEqual({
      ok: true,
      slots: [{ stylistId: uuid, startsAt: '2026-11-02T17:00:00.000Z' }],
    });
  });

  it.each([
    [{ token: 'x', date: '2026-11-02' }, 'INVALID_LINK'],
    [{ token, date: '2026-02-31' }, 'INVALID_INPUT'],
    [{ token, date: 'hoy' }, 'INVALID_INPUT'],
  ])('entrada inválida %j → %s, sin llegar a la BD', async (input, error) => {
    expect(await loadRescheduleAvailability(input)).toEqual({ ok: false, error });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('traduce INVALID_TOKEN, TOO_LATE y el resto sin revelar detalles', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'INVALID_TOKEN' } });
    expect(await loadRescheduleAvailability({ token, date: '2026-11-02' })).toEqual({ ok: false, error: 'INVALID_LINK' });
    rpc.mockResolvedValue({ data: null, error: { message: 'TOO_LATE' } });
    expect(await loadRescheduleAvailability({ token, date: '2026-11-02' })).toEqual({ ok: false, error: 'TOO_LATE' });
    rpc.mockResolvedValue({ data: null, error: { message: 'relation x does not exist' } });
    expect(await loadRescheduleAvailability({ token, date: '2026-11-02' })).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });
});
