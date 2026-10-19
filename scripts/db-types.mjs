#!/usr/bin/env node
// Regenera los tipos de la base de datos.
// Solo se usa si el proyecto tiene Supabase configurado.

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'lib', 'db', 'types.generated.ts');
const HEADER = '// AUTOGENERADO por `pnpm run db:types`. NO editar a mano.\n// Regenerar tras cada migración.\n\n';

function error(m) { process.stderr.write(`[db-types] x ${m}\n`); }
function ok(m)    { process.stdout.write(`[db-types] ok ${m}\n`); }

function supabaseExists() {
  return new Promise((resolve) => {
    const c = spawn('supabase', ['--version'], { stdio: 'ignore' });
    c.on('error', () => resolve(false));
    c.on('exit', (code) => resolve(code === 0));
  });
}

async function main() {
  if (!(await supabaseExists())) {
    error('La CLI de Supabase no está instalada.');
    error('Instálala con: npm i -g supabase');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const tmp = OUT + '.tmp';
  const child = spawn(
    'supabase',
    ['gen', 'types', 'typescript', '--local'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] },
  );

  const chunks = [];
  child.stdout.on('data', (d) => chunks.push(d));
  child.on('error', (err) => {
    error(err.message);
    process.exit(1);
  });
  child.on('exit', (code) => {
    if (code !== 0) {
      error(`supabase gen types terminó con código ${code}`);
      process.exit(1);
    }
    fs.writeFileSync(tmp, HEADER + Buffer.concat(chunks).toString('utf8'));
    fs.renameSync(tmp, OUT);
    ok(`Tipos regenerados en ${path.relative(ROOT, OUT)}`);
  });
}

main();
