#!/usr/bin/env node
// Keep-alive del proyecto gratuito de Supabase (T-013b, ADR-0037, RNF-10, CA-35). Hace 3 lecturas reales de la Data API
// con la clave pública para que el proyecto reciba actividad de base de datos cada día. Solo `fetch`: cross-platform y sin
// instalar dependencias. Nunca imprime la clave.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=... node scripts/keep-alive.mjs
//
// Sale con código 1 si falta configuración o si alguna lectura falla (el workflow falla y GitHub avisa).

import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Tablas de catálogo de lectura pública (RLS): sin datos personales.
export const KEEP_ALIVE_TABLES = ['services', 'stylists', 'salon_hours'];

function out(msg) { process.stdout.write(`[keep-alive] ${msg}\n`); }
function fail(msg) { process.stderr.write(`[keep-alive] x ${msg}\n`); process.exit(1); }

// Devuelve { ok, results }. `fetchImpl` es inyectable para probarlo sin red.
export async function runKeepAlive(env, fetchImpl = fetch) {
  const url = typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL.trim().replace(/\/+$/, '') : '';
  const key = typeof env.SUPABASE_ANON_KEY === 'string' ? env.SUPABASE_ANON_KEY.trim() : '';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
    return { ok: false, error: 'SUPABASE_URL no es la URL de un proyecto de Supabase (https://<ref>.supabase.co).', results: [] };
  }
  if (key === '') return { ok: false, error: 'Falta SUPABASE_ANON_KEY.', results: [] };

  const results = [];
  for (const table of KEEP_ALIVE_TABLES) {
    try {
      const response = await fetchImpl(`${url}/rest/v1/${table}?select=id&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        results.push({ table, ok: false, detail: `HTTP ${response.status}` });
        continue;
      }
      const rows = await response.json();
      const found = Array.isArray(rows) && rows.length > 0;
      results.push({ table, ok: found, detail: found ? 'ok' : 'sin filas' });
    } catch (error) {
      results.push({ table, ok: false, detail: error instanceof Error ? error.name : 'error' });
    }
  }
  return { ok: results.every((r) => r.ok), results };
}

async function main() {
  const { ok, error, results } = await runKeepAlive(process.env);
  if (error) fail(error);
  for (const r of results) out(`${r.table}: ${r.detail}`);
  if (!ok) fail('Alguna lectura falló: el proyecto podría estar pausado o sin datos.');
  out('Proyecto activo.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
}
