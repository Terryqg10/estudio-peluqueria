import { beforeEach, describe, expect, it, vi } from 'vitest';

// T-028 (ADR-0036): el guardián del panel distingue Admin y cuenta demo. La demo lee (requirePanel) pero no pasa por
// `requireAdmin`, que la devuelve al panel con el aviso de solo lectura.
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
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to), notFound: () => notFound() }));

import { getAdminState, requireAdmin, requirePanel } from '@/lib/account/require-admin';

function roles(admin: boolean, demo: boolean) {
  rpc.mockImplementation((name: string) =>
    Promise.resolve({ data: name === 'is_admin' ? admin : name === 'is_demo' ? demo : null, error: null }),
  );
}

beforeEach(() => {
  rpc.mockReset();
  getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1', email: 'x@correo.com' } } });
  createAuthClient.mockReset().mockResolvedValue({ rpc, auth: { getUser } });
  redirect.mockClear();
  notFound.mockClear();
});

describe('guardián del panel con la cuenta demo', () => {
  it('el Admin entra en lectura y escritura', async () => {
    roles(true, false);
    expect((await getAdminState()).state).toBe('admin');
    expect((await requirePanel()).readOnly).toBe(false);
    await expect(requireAdmin()).resolves.toMatchObject({ userId: 'u1' });
  });

  it('la cuenta demo lee en solo lectura pero requireAdmin la devuelve al panel con el aviso', async () => {
    roles(false, true);
    expect((await getAdminState()).state).toBe('demo');
    expect((await requirePanel()).readOnly).toBe(true);
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/admin?aviso=solo-lectura');
    expect(notFound).not.toHaveBeenCalled();
  });

  it('una clienta o una cuenta sin rol sigue recibiendo 404, también en las páginas de lectura', async () => {
    roles(false, false);
    expect((await getAdminState()).state).toBe('forbidden');
    await expect(requirePanel()).rejects.toThrow('NOT_FOUND');
    await expect(requireAdmin()).rejects.toThrow('NOT_FOUND');
  });

  it('si la comprobación del rol falla, falla cerrado (ni admin ni demo)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect((await getAdminState()).state).toBe('forbidden');
  });

  it('sin sesión lleva al acceso', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(requirePanel()).rejects.toThrow('REDIRECT:/acceso');
  });
});
