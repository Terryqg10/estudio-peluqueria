import { beforeEach, describe, expect, it, vi } from 'vitest';

// Se simulan la BD, la disponibilidad y la sesión para probar solo la lógica de reservar con cuenta (CA-44, CA-45).
const rpc = vi.fn();
const fromProfiles = vi.fn();
const createServiceClient = vi.fn();
const getAvailability = vi.fn();
const getUser = vi.fn();
const authRpc = vi.fn();
const authFrom = vi.fn();
const createAuthClient = vi.fn();

vi.mock('@/lib/supabase/service-client', () => ({ createServiceClient: () => createServiceClient() }));
vi.mock('@/lib/availability/get-availability', () => ({ getAvailability: (i: unknown) => getAvailability(i) }));
vi.mock('@/lib/supabase/auth-server', () => ({ createAuthClient: () => createAuthClient() }));

import { getBookingAccount } from '@/lib/booking/booking-account';
import { createBooking } from '@/lib/booking/create-booking';

const uuid = '3f0c1d2e-8a4b-4c6d-9e1f-2a3b4c5d6e7f';
const USER = '9a8b7c6d-1111-4222-8333-444455556666';
const form = {
  serviceId: uuid,
  stylistId: uuid,
  startsAt: '2026-11-02T09:30:00.000Z',
  name: 'Ana García',
  email: 'otra@correo.com', // lo que escribe el navegador: con cuenta se ignora
  phone: '600 000 000',
  consent: true,
  website: '',
};
const account = { userId: USER, email: 'cuenta@correo.com' };

// `from('profiles')` encadenable: select().eq().maybeSingle() y update().eq().
function profilesTable(profile: { full_name: string | null; phone: string | null } | null) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  fromProfiles.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }),
    update,
  });
  return update;
}

beforeEach(() => {
  for (const m of [rpc, fromProfiles, createServiceClient, getAvailability, getUser, authRpc, authFrom, createAuthClient]) {
    m.mockReset();
  }
  rpc.mockResolvedValue({ data: [{ appointment_id: 'cita-1' }], error: null });
  createServiceClient.mockReturnValue({ rpc, from: fromProfiles });
});

describe('createBooking con cuenta (CA-44, CA-45)', () => {
  it('CA-45: usa el email de la cuenta (no el del formulario) y envía su user_id', async () => {
    profilesTable({ full_name: 'Ana', phone: '600 000 000' });
    expect(await createBooking(form, { ipHash: null, account })).toEqual({ ok: true, appointmentId: 'cita-1' });
    expect(rpc).toHaveBeenCalledWith(
      'create_booking',
      expect.objectContaining({ p_guest_email: 'cuenta@correo.com', p_user_id: USER }),
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('otra@correo.com');
  });

  it('CA-45: sin cuenta reserva como invitada: el email del formulario y NO se envía p_user_id', async () => {
    await createBooking(form, { ipHash: null });
    const args = rpc.mock.calls[0]![1] as Record<string, unknown>;
    expect(args.p_guest_email).toBe('otra@correo.com');
    expect('p_user_id' in args).toBe(false);
    expect(fromProfiles).not.toHaveBeenCalled();
  });

  it('CA-45: un userId que llegue en la entrada del cliente se ignora', async () => {
    await createBooking({ ...form, userId: USER, user_id: USER, p_user_id: USER });
    const args = rpc.mock.calls[0]![1] as Record<string, unknown>;
    expect('p_user_id' in args).toBe(false);
    expect(JSON.stringify(args)).not.toContain(USER);
  });

  it('el honeypot y la validación se aplican igual con cuenta', async () => {
    expect(await createBooking({ ...form, website: 'http://spam' }, { ipHash: null, account })).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    });
    const invalid = await createBooking({ ...form, name: '', consent: false }, { ipHash: null, account });
    expect(invalid).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('traduce los errores de la BD igual (LIMIT_EMAIL)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'LIMIT_EMAIL' } });
    expect(await createBooking(form, { ipHash: null, account })).toEqual({ ok: false, error: 'LIMIT_EMAIL' });
    expect(fromProfiles).not.toHaveBeenCalled();
  });

  it('guarda nombre y teléfono en el perfil solo si faltan', async () => {
    let update = profilesTable({ full_name: null, phone: null });
    await createBooking(form, { ipHash: null, account });
    expect(update).toHaveBeenCalledWith({ full_name: 'Ana García', phone: '600 000 000' });

    update = profilesTable({ full_name: 'Ya tenía', phone: null });
    await createBooking(form, { ipHash: null, account });
    expect(update).toHaveBeenCalledWith({ phone: '600 000 000' });

    update = profilesTable({ full_name: 'Ya tenía', phone: '611 111 111' });
    await createBooking(form, { ipHash: null, account });
    expect(update).not.toHaveBeenCalled();
  });

  it('un fallo al guardar el perfil no afecta a la reserva ya hecha', async () => {
    fromProfiles.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(await createBooking(form, { ipHash: null, account })).toEqual({ ok: true, appointmentId: 'cita-1' });
  });
});

describe('getBookingAccount (CA-44, CA-45)', () => {
  function session(user: { id: string; email?: string | null } | null, admin = false, profile: unknown = null) {
    getUser.mockResolvedValue({ data: { user } });
    authRpc.mockResolvedValue({ data: admin, error: null });
    authFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }),
    });
    createAuthClient.mockResolvedValue({ auth: { getUser }, rpc: authRpc, from: authFrom });
  }

  it('sin sesión o sin email devuelve null', async () => {
    session(null);
    expect(await getBookingAccount()).toBeNull();
    session({ id: USER, email: null });
    expect(await getBookingAccount()).toBeNull();
    createAuthClient.mockResolvedValue(null);
    expect(await getBookingAccount()).toBeNull();
  });

  it('con sesión de clienta devuelve su cuenta con el email en minúsculas y los datos del perfil', async () => {
    session({ id: USER, email: ' Cuenta@Correo.COM ' }, false, { full_name: 'Ana', phone: '600 000 000' });
    expect(await getBookingAccount()).toEqual({
      userId: USER,
      email: 'cuenta@correo.com',
      name: 'Ana',
      phone: '600 000 000',
    });
  });

  it('con sesión de Admin devuelve null: el Admin reserva como invitada', async () => {
    session({ id: USER, email: 'admin@correo.com' }, true);
    expect(await getBookingAccount()).toBeNull();
  });

  it('un error al leer la sesión falla abierto a invitada, sin lanzar', async () => {
    createAuthClient.mockRejectedValue(new Error('boom'));
    expect(await getBookingAccount()).toBeNull();
  });
});
