import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// scripts/check-audit.mjs (ADR-0025): aplica la regla de ADR-0031 (antes ADR-0008 y ADR-0023) («cualquier hallazgo nuevo, o
// cualquiera en producción, bloquea»). Se prueba con fixtures de `pnpm audit --json`, sin tocar la red.
const SCRIPT = path.join(process.cwd(), 'scripts', 'audit-allowlist.json');
const ALLOWLIST = JSON.parse(readFileSync(SCRIPT, 'utf8')) as {
  hallazgos: { id: string; package: string; severity: string; adr: string }[];
};
const KNOWN = ALLOWLIST.hallazgos;

const dir = mkdtempSync(path.join(tmpdir(), 'check-audit-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

type Fake = { id: string; pkg?: string; severity?: string };

function fixture(name: string, advisories: Fake[]): string {
  const file = path.join(dir, name);
  const body = Object.fromEntries(
    advisories.map((a, i) => [
      String(i + 1),
      {
        id: i + 1,
        github_advisory_id: a.id,
        module_name: a.pkg ?? 'paquete',
        severity: a.severity ?? 'high',
        title: `Aviso de prueba ${a.id}`,
      },
    ]),
  );
  writeFileSync(file, JSON.stringify({ advisories: body }));
  return file;
}

function run(prod: string, full: string) {
  const result = spawnSync(
    process.execPath,
    [path.join(process.cwd(), 'scripts', 'check-audit.mjs'), '--prod-file', prod, '--full-file', full],
    { encoding: 'utf8' },
  );
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

const asFake = (list: typeof KNOWN): Fake[] => list.map((h) => ({ id: h.id, pkg: h.package, severity: h.severity }));

describe('scripts/audit-allowlist.json', () => {
  it('recoge solo el hallazgo de `braces` (ADR-0031, sin arreglo publicado), sin repetir id + paquete', () => {
    // T-016 cerró la excepción de ADR-0008 y ADR-0023: queda únicamente lo que no tiene versión corregida.
    expect(KNOWN.map((h) => h.package)).toEqual(['braces']);
    expect(KNOWN.every((h) => h.adr === 'ADR-0031')).toBe(true);
    expect(new Set(KNOWN.map((h) => `${h.id}|${h.package}`)).size).toBe(KNOWN.length);
    for (const h of KNOWN) expect(h.id).toMatch(/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
  });
});

describe('check-audit', () => {
  const clean = () => fixture('vacio.json', []);

  it('pasa con producción limpia y solo los hallazgos de la lista blanca', () => {
    const { code, out } = run(clean(), fixture('conocidos.json', asFake(KNOWN)));
    expect(code).toBe(0);
    expect(out).toContain('Producción: sin hallazgos');
    expect(out).toContain('1 cubierto(s)');
  });

  it('FALLA ante un hallazgo en producción, aunque su id esté en la lista blanca', () => {
    const inProd = fixture('prod-con-hallazgo.json', [asFake(KNOWN)[0] as Fake]);
    const { code, out } = run(inProd, fixture('conocidos.json', asFake(KNOWN)));
    expect(code).toBe(1);
    expect(out).toContain('DEPENDENCIAS DE PRODUCCIÓN');
  });

  it.each(['high', 'critical'])('FALLA ante un hallazgo %s nuevo fuera de la lista blanca', (severity) => {
    const nuevo = fixture('nuevo.json', [...asFake(KNOWN), { id: 'GHSA-aaaa-bbbb-cccc', pkg: 'vite', severity }]);
    const { code, out } = run(clean(), nuevo);
    expect(code).toBe(1);
    expect(out).toContain('GHSA-aaaa-bbbb-cccc');
    expect(out).toContain('NUEVOS');
  });

  it('el mismo aviso en un paquete que no está en la lista blanca NO queda cubierto', () => {
    const conocido = KNOWN.find((h) => h.severity === 'high') as (typeof KNOWN)[number];
    const nuevo = fixture('otro-paquete.json', [...asFake(KNOWN), { id: conocido.id, pkg: 'otro-paquete', severity: 'high' }]);
    const { code, out } = run(clean(), nuevo);
    expect(code).toBe(1);
    expect(out).toContain('otro-paquete');
  });

  it('un hallazgo moderate o low nuevo solo avisa (la puerta es --audit-level=high)', () => {
    const nuevo = fixture('moderado.json', [
      ...asFake(KNOWN),
      { id: 'GHSA-aaaa-bbbb-cccc', severity: 'moderate' },
      { id: 'GHSA-dddd-eeee-ffff', severity: 'low' },
    ]);
    const { code, out } = run(clean(), nuevo);
    expect(code).toBe(0);
    expect(out).toContain('AVISO (no bloquea');
  });

  it('avisa, sin fallar, de las entradas de la lista blanca que ya no aparecen (el arreglo llegó)', () => {
    const { code, out } = run(clean(), fixture('menos.json', asFake(KNOWN.slice(1))));
    expect(code).toBe(0);
    expect(out).toContain('ya no aparece en el audit');
  });

  it('sin evidencia no se da por bueno: un JSON ilegible o sin «advisories» falla', () => {
    const roto = path.join(dir, 'roto.json');
    writeFileSync(roto, 'esto no es json');
    expect(run(clean(), roto).code).toBe(2);

    const sinCampo = path.join(dir, 'sin-campo.json');
    writeFileSync(sinCampo, JSON.stringify({ error: 'ENOTFOUND' }));
    expect(run(sinCampo, clean()).code).toBe(2);
  });
});
