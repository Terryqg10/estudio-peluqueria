import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { KEEP_ALIVE_TABLES, runKeepAlive } from '../../scripts/keep-alive.mjs';

// T-013b (ADR-0037, CA-35): el keep-alive hace lecturas reales de la Data API con la clave pública y falla de forma
// visible; el workflow usa GitHub Secrets y no lleva valores en el repo.
const ENV = { SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co/', SUPABASE_ANON_KEY: 'clave-publica-de-prueba' };

const ok = (rows: unknown[] = [{ id: '1' }]) => ({ ok: true, status: 200, json: () => Promise.resolve(rows) });

describe('runKeepAlive', () => {
  it('lee las tres tablas de catálogo con la clave pública y solo con GET', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok());
    const result = await runKeepAlive(ENV, fetchImpl);
    expect(result.ok).toBe(true);
    expect(result.results.map((r) => r.table)).toEqual(KEEP_ALIVE_TABLES);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const [url, init] of fetchImpl.mock.calls as [string, RequestInit][]) {
      expect(url).toMatch(/^https:\/\/abcdefghijklmnop\.supabase\.co\/rest\/v1\/(services|stylists|salon_hours)\?select=id&limit=1$/);
      expect(init.method ?? 'GET').toBe('GET');
      expect(init.headers).toMatchObject({ apikey: ENV.SUPABASE_ANON_KEY, Authorization: `Bearer ${ENV.SUPABASE_ANON_KEY}` });
    }
  });

  it('no escribe ni toca tablas con datos personales', () => {
    expect(KEEP_ALIVE_TABLES).toEqual(['services', 'stylists', 'salon_hours']);
    for (const table of KEEP_ALIVE_TABLES) expect(table).not.toMatch(/appointment|profile|token/);
  });

  it('falla si una respuesta no es 2xx, viene vacía o hay error de red', async () => {
    const http500 = vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve([]) });
    const a = await runKeepAlive(ENV, http500);
    expect(a.ok).toBe(false);
    expect(a.results.every((r) => r.detail === 'HTTP 503')).toBe(true);

    const empty = vi.fn().mockResolvedValue(ok([]));
    expect((await runKeepAlive(ENV, empty)).ok).toBe(false);

    const down = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const c = await runKeepAlive(ENV, down);
    expect(c.ok).toBe(false);
    expect(c.results[0]?.detail).toBe('TypeError');
  });

  it('una sola tabla que falle hace fallar todo', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok()).mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve([]) }).mockResolvedValueOnce(ok());
    const result = await runKeepAlive(ENV, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.results.map((r) => r.ok)).toEqual([true, false, true]);
  });

  it('sin configuración válida no hace ninguna petición', async () => {
    const fetchImpl = vi.fn();
    for (const env of [
      {},
      { SUPABASE_URL: ENV.SUPABASE_URL },
      { SUPABASE_ANON_KEY: ENV.SUPABASE_ANON_KEY },
      { SUPABASE_URL: 'http://localhost:54421', SUPABASE_ANON_KEY: 'x' },
      { SUPABASE_URL: 'https://otro-sitio.example.com', SUPABASE_ANON_KEY: 'x' },
    ]) {
      const result = await runKeepAlive(env, fetchImpl);
      expect(result.ok, JSON.stringify(env)).toBe(false);
      expect(result.error).toBeTruthy();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('no incluye la clave en los resultados', async () => {
    const result = await runKeepAlive(ENV, vi.fn().mockResolvedValue(ok()));
    expect(JSON.stringify(result)).not.toContain(ENV.SUPABASE_ANON_KEY);
  });
});

describe('workflow keep-alive (CA-35)', () => {
  const workflow = readFileSync('.github/workflows/keep-alive.yml', 'utf8');

  it('está programado a diario y se puede lanzar a mano', () => {
    expect(workflow).toMatch(/schedule:\s*\n\s*- cron: '[0-9*/, ]+ [0-9*/, ]+ \* \* \*'/);
    expect(workflow).toContain('workflow_dispatch:');
  });

  it('lee la URL y la clave de GitHub Secrets y no lleva valores en el repo', () => {
    expect(workflow).toContain('${{ secrets.SUPABASE_URL }}');
    expect(workflow).toContain('${{ secrets.SUPABASE_ANON_KEY }}');
    expect(workflow).not.toMatch(/supabase\.co/);
    expect(workflow).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // ningún JWT
    expect(workflow).not.toMatch(/sb_(publishable|secret)_/);
  });

  it('solo permite leer el contenido y usa Node, no sh', () => {
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(workflow).toContain('run: node scripts/keep-alive.mjs');
    expect(workflow).not.toMatch(/service_role|SERVICE_ROLE/i);
  });
});
