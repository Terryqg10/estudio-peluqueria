import { createHash, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { DEMO_EMAIL } from '../../src/lib/demo/config';
import { enterDemo } from '../../src/lib/demo/enter-demo';
import { anonClient, cleanup, createAdmin, createUser, service, type TestUser } from './helpers/db';

// T-027 (ADR-0036, CA-51): cupo de entradas a la demo por IP, solo con hash y con caducidad; y la entrada real
// contra Supabase local (sesión sin email, rol demo, nunca una cuenta de administración).
const hash = () => createHash('sha256').update(randomUUID()).digest('hex');

describe('demo-limites (CA-51): cupo por IP', () => {
  const created: string[] = [];

  afterAll(async () => {
    if (created.length > 0) await service.from('rate_limits').delete().in('key_hash', created);
    await cleanup();
  });

  it('permite hasta el máximo, rechaza el siguiente y cada IP tiene su cubo', async () => {
    const ip = hash();
    const other = hash();
    created.push(ip, other);

    for (let i = 0; i < 3; i++) {
      const ok = await service.rpc('consume_demo_entry_quota', { p_ip_hash: ip, p_max_per_ip: 3, p_window_minutes: 60 });
      expect(ok.error).toBeNull();
    }
    const blocked = await service.rpc('consume_demo_entry_quota', { p_ip_hash: ip, p_max_per_ip: 3, p_window_minutes: 60 });
    expect(blocked.error?.message).toBe('LIMIT_IP');

    const free = await service.rpc('consume_demo_entry_quota', { p_ip_hash: other, p_max_per_ip: 3, p_window_minutes: 60 });
    expect(free.error).toBeNull();
  });

  it('solo guarda el hash (nunca una IP en claro) y la fila lleva fecha para caducar', async () => {
    const ip = hash();
    created.push(ip);
    await service.rpc('consume_demo_entry_quota', { p_ip_hash: ip, p_max_per_ip: 5, p_window_minutes: 60 });
    const { data } = await service.from('rate_limits').select('kind, key_hash, created_at').eq('key_hash', ip);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.kind).toBe('demo_ip');
    expect(data?.[0]?.key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(data?.[0]?.created_at).toBeTruthy();
  });

  it('las entradas fuera de la ventana no cuentan y se purgan', async () => {
    const ip = hash();
    created.push(ip);
    const old = new Date(Date.now() - 3 * 3600_000).toISOString();
    await service.from('rate_limits').insert({ kind: 'demo_ip', key_hash: ip, created_at: old });
    const ok = await service.rpc('consume_demo_entry_quota', { p_ip_hash: ip, p_max_per_ip: 1, p_window_minutes: 60 });
    expect(ok.error).toBeNull();
    const { data } = await service.from('rate_limits').select('created_at').eq('key_hash', ip);
    expect(data).toHaveLength(1); // la antigua se borró al escribir
  });

  it('rechaza entradas inválidas y no es ejecutable por anónimos ni por clientas', async () => {
    const invalid = await service.rpc('consume_demo_entry_quota', { p_ip_hash: 'corto' });
    expect(invalid.error?.message).toBe('INVALID_INPUT');

    const clienta: TestUser = await createUser('clienta');
    for (const client of [anonClient(), clienta.client]) {
      const denied = await client.rpc('consume_demo_entry_quota', { p_ip_hash: hash() });
      expect(denied.error).not.toBeNull();
    }
  });
});

describe('demo-limites (CA-51): entrada real contra Supabase local', () => {
  afterAll(async () => {
    const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
    const demo = data.users.find((u) => u.email === DEMO_EMAIL);
    if (demo) await service.auth.admin.deleteUser(demo.id);
    await cleanup(); // el Admin de la segunda prueba
  });

  it('crea la cuenta demo en la primera entrada, abre sesión sin email y la entrada se repite', async () => {
    for (let i = 0; i < 2; i++) {
      const auth = anonClient();
      const result = await enterDemo({ ipHash: null }, { service, auth, enabled: true });
      expect(result, `entrada ${i + 1}`).toEqual({ ok: true });

      const user = await auth.auth.getUser();
      expect(user.data.user?.email).toBe(DEMO_EMAIL);
      const isDemo = await auth.rpc('is_demo');
      expect(isDemo.data).toBe(true);
      const isAdmin = await auth.rpc('is_admin');
      expect(isAdmin.data).toBe(false);

      const claims = await auth.auth.getClaims();
      const amr = claims.data?.claims.amr as { timestamp: number }[] | undefined;
      expect(amr?.[0]?.timestamp, 'la marca de la autenticación inicial viaja en el token').toBeGreaterThan(0);
    }
  });

  it('jamás abre la sesión de una cuenta de administración con ese email', async () => {
    const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
    const demo = data.users.find((u) => u.email === DEMO_EMAIL);
    expect(demo).toBeTruthy();
    const admin: TestUser = await createAdmin();
    expect(admin.id).not.toBe(demo?.id);

    await service.from('profiles').update({ role: 'admin' }).eq('id', demo?.id ?? '');
    const auth = anonClient();
    const result = await enterDemo({ ipHash: null }, { service, auth, enabled: true });
    expect(result).toEqual({ ok: false, error: 'UNAVAILABLE' });
    expect((await auth.auth.getUser()).data.user).toBeNull();
    const role = await service.from('profiles').select('role').eq('id', demo?.id ?? '').single();
    expect(role.data?.role).toBe('admin'); // no se tocó
    await service.from('profiles').update({ role: 'demo' }).eq('id', demo?.id ?? '');
  });
});
