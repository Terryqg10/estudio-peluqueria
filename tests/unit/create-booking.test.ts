import { beforeEach, describe, expect, it, vi } from 'vitest';

// Se simulan la BD y la disponibilidad para probar solo la lógica de createBooking.
const rpc = vi.fn();
const createServiceClient = vi.fn();
const getAvailability = vi.fn();

vi.mock('@/lib/supabase/service-client', () => ({ createServiceClient: () => createServiceClient() }));
vi.mock('@/lib/availability/get-availability', () => ({ getAvailability: (i: unknown) => getAvailability(i) }));

import { createBooking } from '@/lib/booking/create-booking';

const uuid = '3f0c1d2e-8a4b-4c6d-9e1f-2a3b4c5d6e7f';
const valid = {
  serviceId: uuid,
  stylistId: uuid,
  startsAt: '2026-11-02T09:30:00.000Z',
  name: 'Ana García',
  email: 'Ana@Correo.com',
  phone: '600 000 000',
  consent: true,
  website: '',
};

beforeEach(() => {
  rpc.mockReset();
  createServiceClient.mockReset();
  getAvailability.mockReset();
  createServiceClient.mockReturnValue({ rpc });
});

describe('createBooking', () => {
  it('CA-28: con el honeypot relleno responde con el error genérico y NO llega a la BD', async () => {
    const result = await createBooking({ ...valid, website: 'http://spam.example' });
    expect(result).toEqual({ ok: false, error: 'UNAVAILABLE' });
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('CA-28: el honeypot responde igual aunque el resto de datos sean inválidos (no delata el campo)', async () => {
    const result = await createBooking({ website: 'x', name: '', email: 'x', phone: '1', consent: false });
    expect(result).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });

  it('CA-10 y CA-25: con datos inválidos o sin consentimiento devuelve errores por campo y no llama a la BD', async () => {
    const result = await createBooking({ ...valid, name: '', consent: false });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error === 'INVALID_INPUT') {
      expect(Object.keys(result.fieldErrors).sort()).toEqual(['consent', 'name']);
    } else {
      throw new Error('se esperaba INVALID_INPUT');
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('con ids o instante manipulados responde con el error genérico, sin llamar a la BD', async () => {
    expect(await createBooking({ ...valid, startsAt: 'mañana' })).toEqual({ ok: false, error: 'UNAVAILABLE' });
    expect(await createBooking({ ...valid, serviceId: 'x' })).toEqual({ ok: false, error: 'UNAVAILABLE' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('CA-10: con datos válidos llama a create_booking con los datos normalizados y la versión de consentimiento', async () => {
    rpc.mockResolvedValue({ data: [{ appointment_id: 'cita-1' }], error: null });
    const result = await createBooking(valid);
    expect(result).toEqual({ ok: true, appointmentId: 'cita-1' });
    expect(rpc).toHaveBeenCalledWith('create_booking', {
      p_service_id: uuid,
      p_stylist_id: uuid,
      p_starts_at: '2026-11-02T09:30:00.000Z',
      p_guest_name: 'Ana García',
      p_guest_email: 'ana@correo.com',
      p_guest_phone: '600 000 000',
      p_consent_version: 'borrador-1',
      // Límites antiabuso (T-005c, ADR-0020): sin IP no se envía hash.
      p_max_active_per_email: 3,
      p_max_per_ip: 10,
      p_ip_window_minutes: 60,
    });
  });

  it('CA-29: con hash de IP lo envía a la BD (nunca la IP) y traduce LIMIT_EMAIL y LIMIT_IP', async () => {
    const ipHash = 'a'.repeat(64);
    rpc.mockResolvedValue({ data: [{ appointment_id: 'cita-1' }], error: null });
    await createBooking(valid, { ipHash });
    expect(rpc).toHaveBeenCalledWith('create_booking', expect.objectContaining({ p_ip_hash: ipHash }));

    rpc.mockResolvedValue({ data: null, error: { message: 'LIMIT_EMAIL' } });
    expect(await createBooking(valid)).toEqual({ ok: false, error: 'LIMIT_EMAIL' });
    rpc.mockResolvedValue({ data: null, error: { message: 'LIMIT_IP' } });
    expect(await createBooking(valid, { ipHash })).toEqual({ ok: false, error: 'LIMIT_IP' });
  });

  it('CA-08: SLOT_TAKEN devuelve alternativas del mismo día, las más cercanas y sin el hueco pedido', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'SLOT_TAKEN' } });
    getAvailability.mockResolvedValue({
      ok: true,
      slots: [
        { stylistId: uuid, startsAt: '2026-11-02T09:30:00.000Z' }, // el pedido: se excluye
        { stylistId: uuid, startsAt: '2026-11-02T13:00:00.000Z' },
        { stylistId: uuid, startsAt: '2026-11-02T09:45:00.000Z' },
        { stylistId: uuid, startsAt: '2026-11-02T09:15:00.000Z' },
      ],
    });
    const result = await createBooking(valid);
    expect(result.ok).toBe(false);
    if (result.ok || result.error !== 'SLOT_TAKEN') throw new Error('se esperaba SLOT_TAKEN');
    expect(result.alternatives.map((a) => a.startsAt)).toEqual([
      '2026-11-02T09:15:00.000Z',
      '2026-11-02T09:45:00.000Z',
      '2026-11-02T13:00:00.000Z',
    ]);
  });

  it('SLOT_TAKEN sin poder consultar alternativas devuelve una lista vacía', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'SLOT_TAKEN' } });
    getAvailability.mockResolvedValue({ ok: false, error: 'UNAVAILABLE' });
    const result = await createBooking(valid);
    expect(result).toEqual({ ok: false, error: 'SLOT_TAKEN', alternatives: [] });
  });

  it('OUT_OF_WINDOW se traduce; cualquier otro error de la BD es genérico y no revela detalles', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'OUT_OF_WINDOW' } });
    expect(await createBooking(valid)).toEqual({ ok: false, error: 'OUT_OF_WINDOW' });

    rpc.mockResolvedValue({ data: null, error: { message: 'relation "x" does not exist' } });
    expect(await createBooking(valid)).toEqual({ ok: false, error: 'UNAVAILABLE' });

    rpc.mockResolvedValue({ data: [], error: null });
    expect(await createBooking(valid)).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });

  it('sin clave de servicio configurada responde con el error genérico', async () => {
    createServiceClient.mockReturnValue(null);
    expect(await createBooking(valid)).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });
});
