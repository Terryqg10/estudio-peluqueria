#!/usr/bin/env node
// Puerta de seguridad de dependencias (rules/quality-gates.md, puerta 5; ADR-0008, ADR-0023, ADR-0025).
//
// Aplica de verdad la regla de los ADR: la excepción cubre SOLO los hallazgos de la lista blanca
// (scripts/audit-allowlist.json) y «cualquier hallazgo nuevo, o cualquiera en producción, bloquea».
//   1. Producción (`pnpm audit --prod`): no admite NINGÚN hallazgo, ni de lista blanca.
//   2. Completo (`pnpm audit`): falla ante un hallazgo high o critical que no esté en la lista blanca.
//      Los moderate o low nuevos solo avisan (la puerta es --audit-level=high).
//   3. Entradas de la lista blanca que ya no aparecen: aviso para retirarlas (el arreglo llegó).
//
// Uso:  node scripts/check-audit.mjs
//       node scripts/check-audit.mjs --prod-file <audit-prod.json> --full-file <audit.json>   (pruebas)
// Cross-platform: Node, sin sh/bash. Solo usa `shell` en Windows, donde pnpm es un .cmd, con argumentos fijos.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST = path.join(ROOT, 'scripts', 'audit-allowlist.json');
const BLOCKING = new Set(['high', 'critical']);

const out = (m) => process.stdout.write(`[check-audit] ${m}\n`);
const bad = (m) => process.stderr.write(`[check-audit] x ${m}\n`);

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// En Windows pnpm es un .cmd y Node exige un shell para lanzarlo; se pasa UNA cadena fija (sin datos
// externos) para no usar `shell` con una lista de argumentos, que Node desaconseja.
function runPnpm(args) {
  const options = { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
  const result =
    process.platform === 'win32'
      ? spawnSync(['pnpm', ...args].join(' '), { ...options, shell: true })
      : spawnSync('pnpm', args, options);
  return result.stdout;
}

// `pnpm audit` sale con código ≠ 0 cuando hay hallazgos: el JSON se lee igual.
function readAudit(file, pnpmArgs) {
  const text =
    file !== undefined
      ? readFileSync(file, 'utf8')
      : runPnpm(pnpmArgs);
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed.advisories !== 'object' || parsed.advisories === null) throw new Error('sin «advisories»');
    return Object.values(parsed.advisories).map((a) => ({
      id: String(a.github_advisory_id ?? a.id),
      pkg: String(a.module_name),
      severity: String(a.severity),
      title: String(a.title),
    }));
  } catch (error) {
    // Si no hay JSON válido NO se da por bueno: sin evidencia, la puerta falla.
    bad(`No se pudo leer el resultado de «pnpm ${pnpmArgs.join(' ')}»: ${error instanceof Error ? error.message : error}`);
    process.exit(2);
  }
}

const allowlist = JSON.parse(readFileSync(ALLOWLIST, 'utf8')).hallazgos ?? [];
// Clave id + paquete: un mismo aviso (GHSA) puede afectar a varios paquetes, y uno nuevo no queda cubierto.
const keyOf = (id, pkg) => `${id}|${pkg}`;
const allowed = new Map(allowlist.map((h) => [keyOf(h.id, h.package), h]));

let failed = false;

// 1) Producción: ni un solo hallazgo.
const prod = readAudit(argValue('--prod-file'), ['audit', '--prod', '--json']);
if (prod.length > 0) {
  failed = true;
  bad(`Hay ${prod.length} hallazgo(s) en DEPENDENCIAS DE PRODUCCIÓN (la excepción no los cubre):`);
  for (const a of prod) bad(`  ${a.severity.padEnd(8)} ${a.pkg}  ${a.id}  ${a.title}`);
} else {
  out('Producción: sin hallazgos.');
}

// 2) Completo: nada nuevo high o critical fuera de la lista blanca.
const full = readAudit(argValue('--full-file'), ['audit', '--json']);
const seen = new Set(full.map((a) => keyOf(a.id, a.pkg)));
const unknown = full.filter((a) => !allowed.has(keyOf(a.id, a.pkg)));
const unknownBlocking = unknown.filter((a) => BLOCKING.has(a.severity));
const unknownWarn = unknown.filter((a) => !BLOCKING.has(a.severity));

if (unknownBlocking.length > 0) {
  failed = true;
  bad(`Hay ${unknownBlocking.length} hallazgo(s) high o critical NUEVOS, fuera de ADR-0008 y ADR-0023:`);
  for (const a of unknownBlocking) bad(`  ${a.severity.padEnd(8)} ${a.pkg}  ${a.id}  ${a.title}`);
  bad('Actualiza la dependencia o registra un ADR nuevo con caducidad y añade el id a scripts/audit-allowlist.json.');
}
for (const a of unknownWarn) out(`AVISO (no bloquea, nivel < high): nuevo ${a.severity} en ${a.pkg} ${a.id}`);

// 3) Entradas ya resueltas.
for (const h of allowlist) {
  if (!seen.has(keyOf(h.id, h.package))) out(`AVISO: ${h.id} (${h.package}) ya no aparece en el audit; retíralo de la lista blanca.`);
}

const covered = full.length - unknown.length;
out(`Completo: ${full.length} hallazgo(s); ${covered} cubierto(s) por ADR-0008 y ADR-0023, ${unknown.length} fuera de la lista.`);

if (failed) process.exit(1);
out('OK.');
