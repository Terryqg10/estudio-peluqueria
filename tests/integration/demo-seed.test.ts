import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanup,
  createService,
  createStylist,
  createDemo,
  daysFromNow,
  insertAppointment,
  service,
  type TestUser,
} from './helpers/db';

// T-029: `pnpm demo:seed --local` crea citas de ejemplo (`is_sample`), las regenera y NUNCA toca las de visitantes.
// Usa el catálogo de la semilla local (estilistas con servicios). Al terminar deja la BD sin citas de ejemplo.
function seed(...args: string[]) {
  return spawnSync(process.execPath, ['scripts/demo-seed.mjs', ...args], { encoding: 'utf8' });
}

const samples = async () => {
  const { data } = await service.from('appointments').select('id, guest_email, status').eq('is_sample', true);
  return data ?? [];
};

describe('demo-seed (T-029)', () => {
  let visitorId = '';
  let demo: TestUser;

  beforeAll(async () => {
    const stylistId = await createStylist();
    const serviceId = await createService(60);
    demo = await createDemo();
    const visitor = await insertAppointment({ stylistId, serviceId, start: daysFromNow(40, 10), guestName: 'Visitante Real' });
    visitorId = visitor.data?.id ?? '';
    expect(visitorId).not.toBe('');
  });

  afterAll(async () => {
    seed('--local', '--clean');
    await cleanup();
  });

  it('exige elegir destino y rechaza opciones desconocidas', () => {
    expect(seed().status).not.toBe(0);
    expect(seed('--local', '--remote').status).not.toBe(0);
    expect(seed('--local', '--otra').status).not.toBe(0);
  });

  it('en remoto exige las variables y nunca acepta una URL local', () => {
    const noEnv = spawnSync(process.execPath, ['scripts/demo-seed.mjs', '--remote'], {
      encoding: 'utf8',
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
    });
    expect(noEnv.status).not.toBe(0);
    const localUrl = spawnSync(process.execPath, ['scripts/demo-seed.mjs', '--remote'], {
      encoding: 'utf8',
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54421', SUPABASE_SERVICE_ROLE_KEY: 'x' },
    });
    expect(localUrl.status).not.toBe(0);
    expect(localUrl.stderr).toContain('no puede ser local');
  });

  it('crea citas de ejemplo ficticias y no toca la cita de un visitante', async () => {
    const run = seed('--local');
    expect(run.status, run.stderr).toBe(0);
    const rows = await samples();
    expect(rows.length).toBeGreaterThan(20);
    for (const row of rows) expect(row.guest_email).toMatch(/@ejemplo\.invalid$/);

    const visitor = await service.from('appointments').select('is_sample, guest_name').eq('id', visitorId).single();
    expect(visitor.data).toEqual({ is_sample: false, guest_name: 'Visitante Real' });
  });

  it('al repetirlo las regenera (mismo número) y la cuenta demo las ve completas', async () => {
    const before = (await samples()).length;
    const run = seed('--local');
    expect(run.status, run.stderr).toBe(0);
    expect((await samples()).length).toBe(before);

    const sample = (await samples())[0];
    const asDemo = await demo.client.from('panel_appointments').select('guest_name, guest_email').eq('id', sample?.id ?? '');
    expect(asDemo.data?.[0]?.guest_email).toMatch(/@ejemplo\.invalid$/); // completo, no «e•••@•••»
    expect(asDemo.data?.[0]?.guest_name).not.toContain('•');
  });

  it('--clean borra solo las de ejemplo', async () => {
    const run = seed('--local', '--clean');
    expect(run.status, run.stderr).toBe(0);
    expect(await samples()).toEqual([]);
    const visitor = await service.from('appointments').select('id').eq('id', visitorId);
    expect(visitor.data).toHaveLength(1);
  });
});
