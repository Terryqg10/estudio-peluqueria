import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@/lib/database.types';
import { DEMO_EMAIL, DEMO_ENTRY_LIMITS, DEMO_SESSION_MINUTES, isDemoEnabled } from '@/lib/demo/config';
import { enterDemo } from '@/lib/demo/enter-demo';
import { isDemoSessionExpired } from '@/lib/demo/session';

type Db = SupabaseClient<Database>;

const HASH = 'a'.repeat(64);

function fakes(options: { quota?: string; role?: string | null; verifyError?: boolean; linkOk?: boolean } = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const verifyOtp = vi.fn().mockResolvedValue(
    options.verifyError ? { data: { session: null }, error: { message: 'x' } } : { data: { session: { access_token: 't' } }, error: null },
  );
  const rpc = vi.fn().mockResolvedValue({ error: options.quota ? { message: options.quota } : null });
  const generateLink = vi.fn().mockResolvedValue(
    options.linkOk === false
      ? { data: null, error: { message: 'x' } }
      : { data: { user: { id: 'u1' }, properties: { hashed_token: 'hash-1' } }, error: null },
  );
  const from = vi.fn().mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: options.role === undefined ? { role: 'client' } : options.role ? { role: options.role } : null, error: null }),
      }),
    }),
    upsert,
  });
  const service = { rpc, from, auth: { admin: { generateLink } } } as unknown as Db;
  const auth = { auth: { verifyOtp } } as unknown as Db;
  return { service, auth, rpc, from, upsert, verifyOtp, generateLink };
}

describe('isDemoEnabled', () => {
  it('solo con DEMO_ENABLED=1 (CA-48)', () => {
    expect(isDemoEnabled({ DEMO_ENABLED: '1' })).toBe(true);
    for (const value of [undefined, '', '0', 'true', 'yes']) {
      expect(isDemoEnabled({ DEMO_ENABLED: value }), String(value)).toBe(false);
    }
  });
});

describe('enterDemo (CA-48, CA-51)', () => {
  it('sin la variable no hace nada: ni cupo, ni cuenta, ni sesión', async () => {
    const f = fakes();
    const result = await enterDemo({ ipHash: HASH }, { service: f.service, auth: f.auth, enabled: false });
    expect(result).toEqual({ ok: false, error: 'DISABLED' });
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.generateLink).not.toHaveBeenCalled();
    expect(f.verifyOtp).not.toHaveBeenCalled();
  });

  it('abre la sesión de la cuenta demo con el enlace generado y promueve el rol si hace falta', async () => {
    const f = fakes({ role: 'client' });
    const result = await enterDemo({ ipHash: HASH }, { service: f.service, auth: f.auth, enabled: true });
    expect(result).toEqual({ ok: true });
    expect(f.rpc).toHaveBeenCalledWith('consume_demo_entry_quota', {
      p_ip_hash: HASH,
      p_max_per_ip: DEMO_ENTRY_LIMITS.maxPerIp,
      p_window_minutes: DEMO_ENTRY_LIMITS.windowMinutes,
    });
    expect(f.generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: DEMO_EMAIL });
    expect(f.upsert).toHaveBeenCalledWith({ id: 'u1', role: 'demo' }, { onConflict: 'id' });
    expect(f.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-1', type: 'email' });
  });

  it('con la cuenta ya en rol demo no vuelve a escribir el perfil', async () => {
    const f = fakes({ role: 'demo' });
    expect(await enterDemo({ ipHash: HASH }, { service: f.service, auth: f.auth, enabled: true })).toEqual({ ok: true });
    expect(f.upsert).not.toHaveBeenCalled();
  });

  it('falla cerrado si la cuenta del email fijo es de administración: no abre sesión', async () => {
    const f = fakes({ role: 'admin' });
    const result = await enterDemo({ ipHash: HASH }, { service: f.service, auth: f.auth, enabled: true });
    expect(result).toEqual({ ok: false, error: 'UNAVAILABLE' });
    expect(f.verifyOtp).not.toHaveBeenCalled();
    expect(f.upsert).not.toHaveBeenCalled();
  });

  it('con el cupo agotado rechaza antes de crear nada', async () => {
    const f = fakes({ quota: 'LIMIT_IP' });
    const result = await enterDemo({ ipHash: HASH }, { service: f.service, auth: f.auth, enabled: true });
    expect(result).toEqual({ ok: false, error: 'LIMIT' });
    expect(f.generateLink).not.toHaveBeenCalled();
    expect(f.verifyOtp).not.toHaveBeenCalled();
  });

  it('un error del cupo distinto del límite es indisponibilidad', async () => {
    const f = fakes({ quota: 'INVALID_INPUT' });
    expect(await enterDemo({ ipHash: HASH }, { service: f.service, auth: f.auth, enabled: true })).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    });
  });

  it('sin hash de IP (límite apagado fuera de producción) no consulta el cupo', async () => {
    const f = fakes({ role: 'demo' });
    expect(await enterDemo({ ipHash: null }, { service: f.service, auth: f.auth, enabled: true })).toEqual({ ok: true });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('indisponible si falla el enlace, el canje o faltan los clientes', async () => {
    const noLink = fakes({ linkOk: false });
    expect(await enterDemo({ ipHash: HASH }, { service: noLink.service, auth: noLink.auth, enabled: true })).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    });
    const noSession = fakes({ role: 'demo', verifyError: true });
    expect(await enterDemo({ ipHash: HASH }, { service: noSession.service, auth: noSession.auth, enabled: true })).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    });
    expect(await enterDemo({ ipHash: HASH }, { service: null, auth: null, enabled: true })).toEqual({
      ok: false,
      error: 'UNAVAILABLE',
    });
  });
});

describe('isDemoSessionExpired (CA-51)', () => {
  const START = 1_800_000_000; // segundos
  const claims = (email: string, stamps: number[]) => ({
    email,
    amr: stamps.map((timestamp) => ({ method: 'otp', timestamp })),
  });

  it('la sesión demo vale hasta la hora de la autenticación inicial', () => {
    const c = claims(DEMO_EMAIL, [START]);
    expect(isDemoSessionExpired(c, START * 1000)).toBe(false);
    expect(isDemoSessionExpired(c, (START + DEMO_SESSION_MINUTES * 60 - 1) * 1000)).toBe(false);
    expect(isDemoSessionExpired(c, (START + DEMO_SESSION_MINUTES * 60) * 1000)).toBe(true);
    expect(isDemoSessionExpired(c, (START + 24 * 3600) * 1000)).toBe(true);
  });

  it('usa la marca más antigua si hay varias', () => {
    const c = claims(DEMO_EMAIL, [START + 3000, START]);
    expect(isDemoSessionExpired(c, (START + DEMO_SESSION_MINUTES * 60) * 1000)).toBe(true);
  });

  it('sin marca de tiempo válida cuenta como caducada (falla cerrado)', () => {
    for (const amr of [undefined, [], [{ method: 'otp' }], [{ timestamp: 'ayer' }], 'x']) {
      expect(isDemoSessionExpired({ email: DEMO_EMAIL, amr }, START * 1000), JSON.stringify(amr)).toBe(true);
    }
  });

  it('nunca caduca las cuentas que no son la demo', () => {
    expect(isDemoSessionExpired(claims('admin@correo.com', [START]), (START + 99 * 3600) * 1000)).toBe(false);
    expect(isDemoSessionExpired({ amr: [] }, START * 1000)).toBe(false);
  });
});
