import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cleanup, createUser, service } from './helpers/db';

// Alta y baja del Admin con `scripts/admin-promote.mjs` (ADR-0022, T-008a). El script usa la clave de
// servicio de Supabase local; el rol que deja es el que lee `is_admin()` (el mismo que usa la RLS).
const SCRIPT = path.join(process.cwd(), 'scripts', 'admin-promote.mjs');

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args, '--local'], { encoding: 'utf8' });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

async function roleOf(id: string) {
  const { data } = await service.from('profiles').select('role').eq('id', id).maybeSingle();
  return data?.role ?? null;
}

describe('admin-promote (ADR-0022)', () => {
  afterAll(cleanup);

  it('da el rol de Admin y la sesión que ya estaba abierta lo ve en la siguiente petición', async () => {
    const user = await createUser('promover');
    expect((await user.client.rpc('is_admin')).data).toBe(false);

    const result = run(user.email);
    expect(result.code).toBe(0);
    expect(result.out).toContain('ahora es admin');
    expect(await roleOf(user.id)).toBe('admin');
    // El rol se lee de la BD, no de la sesión: sin volver a entrar, ya es Admin.
    expect((await user.client.rpc('is_admin')).data).toBe(true);
  });

  it('es idempotente y normaliza mayúsculas y espacios del email', async () => {
    const user = await createUser('idempotente');
    expect(run(user.email).code).toBe(0);
    const again = run(`  ${user.email.toUpperCase()} `);
    expect(again.code).toBe(0);
    expect(await roleOf(user.id)).toBe('admin');
  });

  it('--revoke devuelve el rol client y la sesión abierta deja de ser Admin', async () => {
    const user = await createUser('revocar');
    run(user.email);
    expect((await user.client.rpc('is_admin')).data).toBe(true);

    const result = run(user.email, '--revoke');
    expect(result.code).toBe(0);
    expect(result.out).toContain('retirado');
    expect(await roleOf(user.id)).toBe('client');
    expect((await user.client.rpc('is_admin')).data).toBe(false);
  });

  it('una cuenta sin fila en profiles se repara al promoverla', async () => {
    const user = await createUser('sin-perfil');
    await service.from('profiles').delete().eq('id', user.id);
    expect(await roleOf(user.id)).toBeNull();

    expect(run(user.email).code).toBe(0);
    expect(await roleOf(user.id)).toBe('admin');
  });

  it('falla sin cambiar nada si la cuenta no existe, el email es inválido o sobran argumentos', async () => {
    const missing = run('nadie-existe@test.invalid');
    expect(missing.code).toBe(1);
    expect(missing.err).toContain('No existe ninguna cuenta');

    expect(run('no-es-un-email').code).toBe(1);
    expect(run().code).toBe(1);
    expect(run('a@b.com', 'otro@b.com').code).toBe(1);
    expect(run('a@b.com', '--inventada').code).toBe(1);
  });

  it('no imprime la clave de servicio', async () => {
    const user = await createUser('sin-clave');
    const result = run(user.email);
    // Ni la clave de servicio (un JWT) ni la URL con credenciales salen por consola.
    expect(result.out + result.err).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(result.out + result.err).not.toMatch(/SERVICE_ROLE_KEY=/);
  });

  it('una clienta no puede darse el rol a sí misma desde su sesión', async () => {
    const user = await createUser('autopromover');
    const own = await user.client.from('profiles').update({ role: 'admin' }).eq('id', user.id).select('id');
    expect(own.data ?? []).toEqual([]); // la política y los privilegios de columna lo impiden
    expect(await roleOf(user.id)).toBe('client');
    expect((await user.client.rpc('is_admin')).data).toBe(false);
  });
});
