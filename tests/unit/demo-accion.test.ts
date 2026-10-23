import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// La acción de servidor del botón (CA-48): sin `DEMO_ENABLED=1` responde 404 y no toca nada.
const notFound = vi.fn(() => {
  throw new Error('NOT_FOUND');
});
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
const enterDemo = vi.fn();
const createServiceClient = vi.fn(() => null);
const createAuthClient = vi.fn(() => Promise.resolve(null));

vi.mock('next/navigation', () => ({ notFound: () => notFound(), redirect: (to: string) => redirect(to) }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve({ get: () => null }) }));
vi.mock('@/lib/demo/enter-demo', () => ({ enterDemo: (...args: unknown[]) => enterDemo(...args) }));
vi.mock('@/lib/supabase/service-client', () => ({ createServiceClient: () => createServiceClient() }));
vi.mock('@/lib/supabase/auth-server', () => ({ createAuthClient: () => createAuthClient() }));

import { enterDemoAction } from '@/app/demo/actions';

beforeEach(() => {
  notFound.mockClear();
  redirect.mockClear();
  enterDemo.mockReset();
  createServiceClient.mockClear();
  createAuthClient.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('enterDemoAction (CA-48)', () => {
  it('sin DEMO_ENABLED responde 404 sin crear clientes ni abrir sesión', async () => {
    vi.stubEnv('DEMO_ENABLED', '');
    await expect(enterDemoAction({ status: 'idle' })).rejects.toThrow('NOT_FOUND');
    expect(enterDemo).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(createAuthClient).not.toHaveBeenCalled();
  });

  it('con la variable y la entrada correcta redirige al panel', async () => {
    vi.stubEnv('DEMO_ENABLED', '1');
    enterDemo.mockResolvedValue({ ok: true });
    await expect(enterDemoAction({ status: 'idle' })).rejects.toThrow('REDIRECT:/admin');
  });

  it('traduce el cupo agotado y los fallos a un estado de la interfaz, sin redirigir', async () => {
    vi.stubEnv('DEMO_ENABLED', '1');
    enterDemo.mockResolvedValueOnce({ ok: false, error: 'LIMIT' });
    expect(await enterDemoAction({ status: 'idle' })).toEqual({ status: 'limit' });
    enterDemo.mockResolvedValueOnce({ ok: false, error: 'UNAVAILABLE' });
    expect(await enterDemoAction({ status: 'idle' })).toEqual({ status: 'unavailable' });
    expect(redirect).not.toHaveBeenCalled();
  });
});
