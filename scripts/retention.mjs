#!/usr/bin/env node
// Retención de datos personales (RF-09, CA-27, ADR-0030). Anonimiza las citas de quien tiene su última
// cita hace más de N meses (24 por defecto, plazo VERIFICAR) y purga los registros de límites caducados.
// Solo con la clave de servicio. Cross-platform (Node, sin sh/bash).
//
//   pnpm run retention -- --local          Supabase local (lee la URL y la clave de `supabase status`)
//   pnpm run retention                     usa NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del entorno
//   pnpm run retention -- --months 36      cambia el plazo (1 a 120)
//
// Nunca imprime claves ni datos personales: solo contadores.

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const MonthsSchema = z.coerce.number().int().min(1).max(120);

function out(msg) { process.stdout.write(`[retention] ${msg}\n`); }
function fail(msg) { process.stderr.write(`[retention] x ${msg}\n`); process.exit(1); }

function parseArgs(argv) {
  // pnpm puede pasar un `--` suelto: se ignora.
  const args = argv.filter((a) => a !== '--');
  let local = false;
  let months = 24;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--local') local = true;
    else if (a === '--months') {
      const parsed = MonthsSchema.safeParse(args[++i]);
      if (!parsed.success) fail('--months debe ser un entero entre 1 y 120.');
      months = parsed.data;
    } else fail(`Opción desconocida: ${a}. Uso: pnpm run retention [-- --local] [--months N]`);
  }
  return { local, months };
}

function connection(local) {
  if (local) {
    // Sin shell: argumentos como array.
    const result = spawnSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' });
    if (result.status !== 0) fail('Supabase local no está en marcha (`supabase start`).');
    const status = JSON.parse(result.stdout);
    return { url: status.API_URL, key: status.SERVICE_ROLE_KEY };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    fail('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno (o usa --local).');
  }
  return { url, key };
}

async function main() {
  const { local, months } = parseArgs(process.argv.slice(2));
  const { url, key } = connection(local);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await client.rpc('anonymize_expired_data', { p_months: months });
  if (error) fail(`La retención falló: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  out(`plazo: ${months} meses`);
  out(`citas anonimizadas: ${row?.appointments_anonymized ?? 0}`);
  out(`perfiles limpiados: ${row?.profiles_cleared ?? 0}`);
  out(`registros de límites purgados: ${row?.rate_limits_purged ?? 0}`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
