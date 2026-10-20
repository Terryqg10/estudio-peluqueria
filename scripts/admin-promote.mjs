#!/usr/bin/env node
// Da o quita el rol de Admin a una cuenta (ADR-0022). Solo se hace con la clave de servicio: no hay
// ninguna forma de hacerse Admin desde la web. Cross-platform (Node, sin sh/bash).
//
//   pnpm admin:promote <email> --local        Supabase local (lee la URL y la clave de `supabase status`)
//   pnpm admin:promote <email>                usa NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del entorno
//   pnpm admin:promote <email> --revoke [...] quita el rol (vuelve a 'client')
//
// La cuenta debe existir: la persona entra una vez con el enlace de /acceso. Nunca imprime claves.

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const EmailSchema = z.string().trim().toLowerCase().max(254).email();

function out(msg) { process.stdout.write(`[admin-promote] ${msg}\n`); }
function fail(msg) { process.stderr.write(`[admin-promote] x ${msg}\n`); process.exit(1); }

function parseArgs(argv) {
  // pnpm puede pasar un `--` suelto: se ignora.
  const args = argv.filter((a) => a !== '--');
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const positional = args.filter((a) => !a.startsWith('--'));
  const unknown = [...flags].filter((f) => f !== '--revoke' && f !== '--local');
  if (unknown.length > 0) fail(`Opción desconocida: ${unknown.join(', ')}`);
  if (positional.length !== 1) fail('Uso: pnpm admin:promote <email> [--revoke] [--local]');
  const email = EmailSchema.safeParse(positional[0]);
  if (!email.success) fail('El email no es válido.');
  return { email: email.data, revoke: flags.has('--revoke'), local: flags.has('--local') };
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

async function findUserId(client, email) {
  // Recorre las páginas hasta encontrar el email (pocas cuentas; tope por seguridad).
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`No se pudo listar las cuentas: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function main() {
  const { email, revoke, local } = parseArgs(process.argv.slice(2));
  const { url, key } = connection(local);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const id = await findUserId(client, email);
  if (!id) fail(`No existe ninguna cuenta con ${email}. Debe entrar una vez con el enlace de /acceso.`);

  const role = revoke ? 'client' : 'admin';
  // upsert: idempotente y cubre una cuenta sin fila en profiles.
  const { error } = await client.from('profiles').upsert({ id, role }, { onConflict: 'id' });
  if (error) fail(`No se pudo cambiar el rol: ${error.message}`);
  out(revoke ? `${email}: rol de administración retirado (ahora client).` : `${email}: ahora es admin.`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
