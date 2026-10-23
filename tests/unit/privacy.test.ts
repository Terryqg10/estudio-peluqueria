import { beforeEach, describe, expect, it, vi } from 'vitest';

// Se simulan los clientes para probar solo la validación y la traducción de errores (CA-26).
const publicRpc = vi.fn();
const createPublicClient = vi.fn();
vi.mock('@/lib/supabase/public-client', () => ({ createPublicClient: () => createPublicClient() }));

const getUser = vi.fn();
const signOut = vi.fn();
const authRpc = vi.fn();
const createAuthClient = vi.fn();
vi.mock('@/lib/supabase/auth-server', () => ({ createAuthClient: () => createAuthClient() }));

const serviceRpc = vi.fn();
const deleteUser = vi.fn();
const createServiceClient = vi.fn();
vi.mock('@/lib/supabase/service-client', () => ({ createServiceClient: () => createServiceClient() }));

import { deleteAccountData } from '@/lib/privacy/delete-account-data';
import { deleteGuestData } from '@/lib/privacy/delete-guest-data';

const token = 'A'.repeat(43);

beforeEach(() => {
  for (const m of [publicRpc, createPublicClient, getUser, signOut, authRpc, createAuthClient, serviceRpc, deleteUser, createServiceClient]) {
    m.mockReset();
  }
  createPublicClient.mockReturnValue({ rpc: publicRpc });
  signOut.mockResolvedValue({});
  createAuthClient.mockResolvedValue({ auth: { getUser, signOut }, rpc: authRpc });
  createServiceClient.mockReturnValue({ rpc: serviceRpc, auth: { admin: { deleteUser } } });
});

describe('deleteGuestData (CA-26)', () => {
  it('con un token válido y la BD respondiendo un número devuelve ok', async () => {
    publicRpc.mockResolvedValue({ data: 2, error: null });
    expect(await deleteGuestData(token)).toEqual({ ok: true });
    expect(publicRpc).toHaveBeenCalledWith('delete_guest_data', { p_token: token });
  });

  it.each([undefined, null, 42, '', 'corto', `${token}x`, 'esto-no-es-un-token!!'])(
    'un token con mala forma (%j) se rechaza sin llegar a la BD',
    async (bad) => {
      expect(await deleteGuestData(bad)).toEqual({ ok: false, error: 'INVALID_LINK' });
      expect(createPublicClient).not.toHaveBeenCalled();
    },
  );

  it('INVALID_TOKEN de la BD se traduce a INVALID_LINK', async () => {
    publicRpc.mockResolvedValue({ data: null, error: { message: 'INVALID_TOKEN' } });
    expect(await deleteGuestData(token)).toEqual({ ok: false, error: 'INVALID_LINK' });
  });

  it('un error desconocido o una respuesta rara no revela detalles', async () => {
    publicRpc.mockResolvedValue({ data: null, error: { message: 'connection refused 10.0.0.1' } });
    expect(await deleteGuestData(token)).toEqual({ ok: false, error: 'UNAVAILABLE' });
    publicRpc.mockResolvedValue({ data: null, error: null });
    expect(await deleteGuestData(token)).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });

  it('sin cliente o si el cliente lanza, es UNAVAILABLE', async () => {
    createPublicClient.mockReturnValue(null);
    expect(await deleteGuestData(token)).toEqual({ ok: false, error: 'UNAVAILABLE' });
    createPublicClient.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(await deleteGuestData(token)).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });
});

describe('deleteAccountData (CA-26)', () => {
  it.each([undefined, null, false, 'true', 1, {}])('sin confirmación explícita (%j) no hace nada', async (bad) => {
    expect(await deleteAccountData(bad)).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(createAuthClient).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it('sin sesión devuelve UNAUTHENTICATED y no toca la BD', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await deleteAccountData(true)).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it('un Admin no puede borrar su cuenta desde aquí', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    authRpc.mockResolvedValue({ data: true, error: null });
    expect(await deleteAccountData(true)).toEqual({ ok: false, error: 'NOT_ALLOWED' });
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it('anonimiza primero, elimina el usuario de Auth después y cierra la sesión; la identidad sale de la sesión', async () => {
    const order: string[] = [];
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    authRpc.mockResolvedValue({ data: false, error: null });
    serviceRpc.mockImplementation(async () => {
      order.push('rpc');
      return { data: 1, error: null };
    });
    deleteUser.mockImplementation(async () => {
      order.push('deleteUser');
      return { error: null };
    });
    expect(await deleteAccountData(true)).toEqual({ ok: true });
    expect(serviceRpc).toHaveBeenCalledWith('delete_account_data', { p_user_id: 'u1' });
    expect(deleteUser).toHaveBeenCalledWith('u1');
    expect(order).toEqual(['rpc', 'deleteUser']);
    expect(signOut).toHaveBeenCalled();
  });

  it('si falla la BD no se elimina el usuario; si falla Auth, es UNAVAILABLE', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    authRpc.mockResolvedValue({ data: false, error: null });
    serviceRpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await deleteAccountData(true)).toEqual({ ok: false, error: 'UNAVAILABLE' });
    expect(deleteUser).not.toHaveBeenCalled();

    serviceRpc.mockResolvedValue({ data: 1, error: null });
    deleteUser.mockResolvedValue({ error: { message: 'x' } });
    expect(await deleteAccountData(true)).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });
});
