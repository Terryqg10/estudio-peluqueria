import { beforeEach, describe, expect, it, vi } from 'vitest';

// Se simula el cliente público para probar solo la traducción de errores de cancelAppointment.
const rpc = vi.fn();
const createPublicClient = vi.fn();
vi.mock('@/lib/supabase/public-client', () => ({ createPublicClient: () => createPublicClient() }));

import { cancelAppointment } from '@/lib/booking/cancel-appointment';

const token = 'A'.repeat(43);

beforeEach(() => {
  rpc.mockReset();
  createPublicClient.mockReset();
  createPublicClient.mockReturnValue({ rpc });
});

describe('cancelAppointment', () => {
  it('CA-13: con un token válido y la BD respondiendo «cancelled» devuelve ok', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'x', status: 'cancelled' }], error: null });
    expect(await cancelAppointment(token)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('cancel_guest_appointment', { p_token: token });
  });

  it.each([undefined, null, 42, '', 'corto', `${token}x`, 'esto-no-es-un-token!!'])(
    'un token con mala forma (%j) se rechaza sin llegar a la BD',
    async (bad) => {
      expect(await cancelAppointment(bad)).toEqual({ ok: false, error: 'INVALID_LINK' });
      expect(createPublicClient).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it('CA-14: TOO_LATE de la BD se traduce a TOO_LATE', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'TOO_LATE' } });
    expect(await cancelAppointment(token)).toEqual({ ok: false, error: 'TOO_LATE' });
  });

  it('INVALID_TOKEN de la BD se traduce a INVALID_LINK', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'INVALID_TOKEN' } });
    expect(await cancelAppointment(token)).toEqual({ ok: false, error: 'INVALID_LINK' });
  });

  it('un error desconocido no revela detalles', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection refused 10.0.0.1' } });
    expect(await cancelAppointment(token)).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });

  it('una respuesta sin fila o sin estado «cancelled» es UNAVAILABLE', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await cancelAppointment(token)).toEqual({ ok: false, error: 'UNAVAILABLE' });
    rpc.mockResolvedValue({ data: [{ id: 'x', status: 'confirmed' }], error: null });
    expect(await cancelAppointment(token)).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });

  it('sin cliente configurado, o si la llamada lanza, devuelve UNAVAILABLE', async () => {
    createPublicClient.mockReturnValue(null);
    expect(await cancelAppointment(token)).toEqual({ ok: false, error: 'UNAVAILABLE' });
    createPublicClient.mockReturnValue({ rpc });
    rpc.mockRejectedValue(new Error('boom'));
    expect(await cancelAppointment(token)).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });
});
