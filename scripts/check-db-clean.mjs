#!/usr/bin/env node
// Comprueba que la BD LOCAL de Supabase no tiene restos de pruebas: nada que no sea de la semilla (T-022).
// Sale con código 1 y lista los restos si los hay. Solo local: la URL sale de `supabase status` y se exige que
// sea local. Cross-platform (Node, sin sh/bash).
//
//   pnpm run check-db-clean
//
// Arréglalo con `pnpm run db:reset:local`. `rate_limits` se ignora a propósito (caduca sola).

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { findLeftovers, isLocalUrl, parseSeed } from './lib/local-db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function out(msg) { process.stdout.write(`[check-db-clean] ${msg}\n`); }
function fail(msg) { process.stderr.write(`[check-db-clean] x ${msg}\n`); process.exit(1); }

const status = spawnSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' });
if (status.status !== 0) fail('Supabase local no está en marcha (`supabase start`).');
const { API_URL: url, SERVICE_ROLE_KEY: key } = JSON.parse(status.stdout);
if (!isLocalUrl(url)) fail('La URL de Supabase no es local: no se comprueba nada.');

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const seed = parseSeed(readFileSync(path.join(ROOT, 'supabase', 'seed.sql'), 'utf8'));
if (seed.stylists.length === 0 || seed.services.length === 0) fail('No se pudo leer la semilla (supabase/seed.sql).');

async function names(table) {
  const { data, error } = await client.from(table).select('name');
  if (error) fail(`No se pudo leer ${table}: ${error.message}`);
  return data.map((row) => row.name);
}
async function count(table) {
  const { count: n, error } = await client.from(table).select('*', { count: 'exact', head: true });
  if (error) fail(`No se pudo contar ${table}: ${error.message}`);
  return n ?? 0;
}
const users = await client.auth.admin.listUsers({ perPage: 1000 });
if (users.error) fail(`No se pudo listar las cuentas: ${users.error.message}`);

const leftovers = findLeftovers(
  {
    stylists: await names('stylists'),
    services: await names('services'),
    appointments: await count('appointments'),
    timeBlocks: await count('time_blocks'),
    deletionRequests: await count('deletion_requests'),
    profiles: await count('profiles'),
    authUsers: users.data.users.length,
  },
  seed,
);

if (leftovers.length > 0) {
  process.stderr.write('[check-db-clean] x La BD local tiene restos de pruebas:\n');
  for (const item of leftovers) process.stderr.write(`  - ${item}\n`);
  process.stderr.write('[check-db-clean] Límpiala con `pnpm run db:reset:local`.\n');
  process.exit(1);
}
out('OK: la BD local solo tiene la semilla.');
