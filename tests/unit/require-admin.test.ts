import { beforeEach, describe, expect, it, vi } from 'vitest';

// Se simulan la sesión y la navegación para probar solo el guardián del panel (ADR-0022).
const rpc = vi.fn();
const getUser = vi.fn();
const createAuthClient = vi.fn();
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
const notFound = vi.fn(() => {
  throw new Error('NOT_FOUND');
});

vi.mock('@/lib/supabase/auth-server', () => ({ createAuthClient: () => createAuthClient() }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => redirect(to),
  notFound: () => notFound(),
}));

import { getAdminState, isAdminSession, requireAdmin } from '@/lib/account/require-admin';

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: true, error: null });
  getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1', email: 'admin@correo.com' } } });
  createAuthClient.mockReset().mockResolvedValue({ rpc, auth: { getUser } });
  redirect.mockClear();
  notFound.mockClear();
});

describe('isAdminSession', () => {
  it('es true solo si is_admin() devuelve exactamente true', async () => {
    const client = { rpc } as never;
    expect(await isAdminSession(client)).toBe(true);
    for (const data of [false, null, 'true', 1, undefined]) {
      rpc.mockResolvedValue({ data, error: null });
      expect(await isAdminSession(client)).toBe(false);
    }
  });

  it('falla cerrado: un error de la BD no da acceso aunque venga data', async () => {
    rpc.mockResolvedValue({ data: true, error: { message: 'boom' } });
    expect(await isAdminSession({ rpc } as never)).toBe(false);
  });
});

describe('getAdminState', () => {
  it('sin sesión es anonymous y NO consulta el rol', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await getAdminState()).toEqual({ state: 'anonymous' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('con sesión sin rol admin es forbidden', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await getAdminState()).toEqual({ state: 'forbidden' });
  });

  it('con rol admin devuelve el cliente de la sesión, el id y el email', async () => {
    const result = await getAdminState();
    expect(result).toMatchObject({ state: 'admin', userId: 'u1', email: 'admin@correo.com' });
  });

  it('sin cliente de Auth (entorno incompleto) es forbidden, no admin', async () => {
    createAuthClient.mockResolvedValue(null);
    expect(await getAdminState()).toEqual({ state: 'forbidden' });
  });

  it('consulta el rol en cada llamada (revocar surte efecto sin volver a entrar)', async () => {
    expect((await getAdminState()).state).toBe('admin');
    rpc.mockResolvedValue({ data: false, error: null });
    expect((await getAdminState()).state).toBe('forbidden');
    // Admin (1 consulta) + no admin: se pregunta también por la cuenta demo (2 consultas) = 3 (T-028, ADR-0036).
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});

describe('requireAdmin', () => {
  it('sin sesión redirige a /acceso', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/acceso');
    expect(notFound).not.toHaveBeenCalled();
  });

  it('con sesión sin rol admin da 404 (no redirige: no revela que el panel existe)', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(requireAdmin()).rejects.toThrow('NOT_FOUND');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('un error al comprobar el rol también da 404', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(requireAdmin()).rejects.toThrow('NOT_FOUND');
  });

  it('con rol admin devuelve el contexto', async () => {
    expect(await requireAdmin()).toMatchObject({ userId: 'u1', email: 'admin@correo.com' });
  });
});
