#!/usr/bin/env node
// Citas, vacaciones y bloqueos de ejemplo de la demo (T-029, T-032, ADR-0036). Borra las citas `is_sample` y los bloqueos con la marca
// «(ejemplo)» en la nota y crea otros nuevos alrededor de hoy; nunca toca citas de visitantes ni bloqueos reales. Necesita el catálogo (estilistas, servicios y quién hace qué) ya cargado.
// Cross-platform (Node, sin sh/bash).
//
//   pnpm demo:seed --local     Supabase local (lee la URL y la clave de `supabase status`)
//   pnpm demo:seed --remote    proyecto alojado: usa NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del entorno
//   pnpm demo:seed --clean ... solo borra las de ejemplo (con --local o --remote)
//
// Nunca imprime claves; en remoto muestra el destino antes de escribir.

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { isLocalUrl } from './lib/local-db.mjs';
import { SAMPLE_NOTE_MARK, madridToUtcIso, planSampleAppointments, planSampleBlocks } from './lib/demo-seed.mjs';

function out(msg) { process.stdout.write(`[demo-seed] ${msg}\n`); }
function fail(msg) { process.stderr.write(`[demo-seed] x ${msg}\n`); process.exit(1); }

function parseArgs(argv) {
  const args = argv.filter((a) => a !== '--');
  const unknown = args.filter((a) => !['--local', '--remote', '--clean'].includes(a));
  if (unknown.length > 0) fail(`Opción desconocida: ${unknown.join(', ')}`);
  const local = args.includes('--local');
  const remote = args.includes('--remote');
  if (local === remote) fail('Uso: pnpm demo:seed (--local | --remote) [--clean]');
  return { local, clean: args.includes('--clean') };
}

function connection(local) {
  if (local) {
    const result = spawnSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' });
    if (result.status !== 0) fail('Supabase local no está en marcha (`supabase start`).');
    const status = JSON.parse(result.stdout);
    if (!isLocalUrl(status.API_URL)) fail('La URL de `supabase status` no es local.');
    return { url: status.API_URL, key: status.SERVICE_ROLE_KEY };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  if (isLocalUrl(url)) fail('Con --remote la URL no puede ser local (usa --local).');
  return { url, key };
}

const madridToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

async function main() {
  const { local, clean } = parseArgs(process.argv.slice(2));
  const { url, key } = connection(local);
  out(`Destino: ${new URL(url).host}${local ? ' (local)' : ' (REMOTO)'}`);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const removed = await client.from('appointments').delete().eq('is_sample', true).select('id');
  if (removed.error) fail(`No se pudieron borrar las citas de ejemplo: ${removed.error.message}`);
  out(`Citas de ejemplo borradas: ${removed.data.length}`);
  const removedBlocks = await client.from('time_blocks').delete().like('note', `%${SAMPLE_NOTE_MARK}`).select('id');
  if (removedBlocks.error) fail(`No se pudieron borrar los bloqueos de ejemplo: ${removedBlocks.error.message}`);
  out(`Bloqueos de ejemplo borrados: ${removedBlocks.data.length}`);
  if (clean) return;

  const [stylists, services, links] = await Promise.all([
    client.from('stylists').select('id, name').eq('active', true).order('name'),
    client.from('services').select('id, name, duration_min').eq('active', true),
    client.from('stylist_services').select('stylist_id, service_id'),
  ]);
  for (const res of [stylists, services, links]) if (res.error) fail(`No se pudo leer el catálogo: ${res.error.message}`);

  const byId = new Map(services.data.map((s) => [s.id, { id: s.id, name: s.name, durationMin: s.duration_min }]));
  const plan = planSampleAppointments({
    today: madridToday(),
    stylists: stylists.data.map((st) => ({
      id: st.id,
      name: st.name,
      services: links.data.filter((l) => l.stylist_id === st.id).flatMap((l) => (byId.has(l.service_id) ? [byId.get(l.service_id)] : [])),
    })),
  });
  if (plan.length === 0) fail('No hay catálogo cargado (estilistas con servicios): carga antes la semilla.');

  let created = 0;
  let skipped = 0;
  let notes = 0;
  for (const item of plan) {
    const start = madridToUtcIso(item.date, item.time);
    const end = new Date(new Date(start).getTime() + item.minutes * 60000).toISOString();
    const inserted = await client
      .from('appointments')
      .insert({
        stylist_id: item.stylistId,
        service_id: item.serviceId,
        during: `[${start},${end})`,
        status: item.status,
        guest_name: item.name,
        guest_email: item.email,
        guest_phone: item.phone,
        is_sample: true,
      })
      .select('id')
      .single();
    if (inserted.error) {
      // Un hueco ya ocupado por una cita real (restricción anti-solape) se omite.
      if (inserted.error.code === '23P01') { skipped++; continue; }
      fail(`No se pudo crear una cita de ejemplo: ${inserted.error.message}`);
    }
    created++;
    if (item.note) {
      const note = await client.from('appointment_notes').insert({ appointment_id: inserted.data.id, note: item.note });
      if (note.error) fail(`No se pudo crear una nota: ${note.error.message}`);
      notes++;
    }
  }
  out(`Citas de ejemplo creadas: ${created} (omitidas por solape: ${skipped}), con ${notes} notas.`);

  const blocks = planSampleBlocks({ today: madridToday(), stylists: stylists.data.map((st) => ({ id: st.id })) });
  for (const block of blocks) {
    const inserted = await client.from('time_blocks').insert({
      stylist_id: block.stylistId,
      kind: block.kind,
      during: `[${block.startsAt},${block.endsAt})`,
      note: block.note,
    });
    if (inserted.error) fail(`No se pudo crear un bloqueo de ejemplo: ${inserted.error.message}`);
  }
  out(`Bloqueos y vacaciones de ejemplo creados: ${blocks.length}.`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
