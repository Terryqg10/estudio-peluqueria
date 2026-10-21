#!/usr/bin/env node
// Solo para CI (ADR-0025): exporta al resto de pasos del workflow las variables que necesita la app para
// hablar con el Supabase LOCAL que acaba de arrancar en el runner (`supabase start`).
// Lee `supabase status -o json` y escribe en el archivo $GITHUB_ENV. Son las claves de demostración del
// Supabase local (no son secretos de nadie), pero se enmascaran igualmente en los logs. Nada se guarda en el
// repo y no se usan secretos de GitHub. Cross-platform: Node, sin shell.

import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import process from 'node:process';

const fail = (m) => {
  process.stderr.write(`[ci-supabase-env] x ${m}\n`);
  process.exit(1);
};

const target = process.env.GITHUB_ENV;
if (!target) fail('Falta GITHUB_ENV: este script solo se ejecuta dentro de GitHub Actions.');

const result = spawnSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' });
if (result.status !== 0) fail('Supabase local no está en marcha (`supabase start` debe ir antes).');

let status;
try {
  status = JSON.parse(result.stdout);
} catch {
  fail('`supabase status -o json` no devolvió JSON válido.');
}

const values = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
};

for (const [name, value] of Object.entries(values)) {
  if (typeof value !== 'string' || value.length === 0) fail(`Falta ${name} en la salida de supabase status.`);
}

for (const [name, value] of Object.entries(values)) {
  if (name !== 'NEXT_PUBLIC_SUPABASE_URL') process.stdout.write(`::add-mask::${value}\n`);
  appendFileSync(target, `${name}=${value}\n`);
}
process.stdout.write('[ci-supabase-env] Variables del Supabase local exportadas.\n');
