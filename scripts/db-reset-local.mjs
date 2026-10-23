#!/usr/bin/env node
// Reinicia la BD LOCAL de Supabase (migraciones + semilla). T-022. Borra TODO lo que haya en ella, incluidas las
// cuentas de prueba: por eso solo actúa contra la máquina local. Cross-platform (Node, sin sh/bash).
//
//   pnpm run db:reset:local
//
// La URL sale de `supabase status` (nunca de variables de entorno de producción) y se exige que sea local.

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { isLocalUrl } from './lib/local-db.mjs';

function out(msg) { process.stdout.write(`[db-reset-local] ${msg}\n`); }
function fail(msg) { process.stderr.write(`[db-reset-local] x ${msg}\n`); process.exit(1); }

const status = spawnSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' });
if (status.status !== 0) fail('Supabase local no está en marcha (`supabase start`).');

let apiUrl;
try {
  apiUrl = JSON.parse(status.stdout).API_URL;
} catch {
  fail('No se pudo leer la salida de `supabase status`.');
}
if (!isLocalUrl(apiUrl)) fail('La URL de Supabase no es local: no se reinicia nada.');

out('Reiniciando la BD local (se borran los datos y las cuentas; vuelve la semilla)…');
// `--local` explícito: nunca contra un proyecto enlazado.
const reset = spawnSync('supabase', ['db', 'reset', '--local'], { stdio: 'inherit' });
if (reset.status !== 0) fail('`supabase db reset` falló.');
out('Hecho: la BD local solo tiene la semilla.');
