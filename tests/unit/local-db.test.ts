import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findLeftovers, isLocalUrl, parseSeed, type Snapshot } from '../../scripts/lib/local-db.mjs';

// T-022: la guarda «solo local» y la detección de restos de pruebas de los scripts de la BD local.
describe('isLocalUrl (la guarda de db:reset:local y check-db-clean)', () => {
  it.each(['http://127.0.0.1:54421', 'http://localhost:54321', 'https://localhost', 'http://[::1]:54321'])(
    'acepta %s',
    (url) => expect(isLocalUrl(url)).toBe(true),
  );

  it.each([
    'https://abcd1234.supabase.co',
    'https://proyecto.supabase.co/rest/v1',
    'http://127.0.0.1.evil.com',
    'http://localhost.evil.com',
    'http://evil.com/?h=127.0.0.1',
    'http://10.0.0.5:54321',
    'http://0.0.0.0:54321',
    'ftp://127.0.0.1',
    '127.0.0.1:54321',
    'no es una url',
    '',
    '   ',
    undefined,
    null,
    42,
  ])('rechaza %j (falla cerrado)', (url) => expect(isLocalUrl(url)).toBe(false));
});

describe('parseSeed', () => {
  const seed = parseSeed(readFileSync(path.join(process.cwd(), 'supabase', 'seed.sql'), 'utf8'));

  it('lee las 3 estilistas y los 8 servicios reales de la semilla', () => {
    expect(seed.stylists).toEqual(['Lucía Marín', 'Carmen Ortega', 'Irene Solís']);
    expect(seed.services).toHaveLength(8);
    expect(seed.services).toContain('Corte mujer');
    expect(seed.services).toContain('Tratamiento hidratante');
    // La categoría no cuenta como nombre.
    expect(seed.services).not.toContain('Color y peinado');
  });

  it('maneja comillas escapadas y bloques ausentes', () => {
    const sql = "insert into public.stylists (name) values\n  ('O''Hara', 'x');\ninsert into public.services (category, name) values\n  ('Cat', 'It''s', 1);";
    expect(parseSeed(sql)).toEqual({ stylists: ["O'Hara"], services: ["It's"] });
    expect(parseSeed('select 1;')).toEqual({ stylists: [], services: [] });
  });
});

describe('findLeftovers', () => {
  const seed = { stylists: ['Lucía Marín', 'Irene Solís'], services: ['Corte mujer', 'Peinado'] };
  const clean: Snapshot = {
    stylists: ['Lucía Marín', 'Irene Solís'],
    services: ['Corte mujer', 'Peinado'],
    appointments: 0,
    timeBlocks: 0,
    deletionRequests: 0,
    profiles: 0,
    authUsers: 0,
  };

  it('una BD solo con la semilla no tiene restos', () => {
    expect(findLeftovers(clean, seed)).toEqual([]);
  });

  it('detecta estilistas y servicios fuera de la semilla (y los lista una vez)', () => {
    const leftovers = findLeftovers(
      { ...clean, stylists: [...clean.stylists, 'Estilista cuenta', 'Estilista cuenta'], services: [...clean.services, 'Servicio de prueba 1'] },
      seed,
    );
    expect(leftovers).toHaveLength(2);
    expect(leftovers[0]).toContain('2 estilista(s)');
    expect(leftovers[0]).toContain('Estilista cuenta');
    expect(leftovers[1]).toContain('1 servicio(s)');
  });

  it.each([
    ['appointments', 'cita(s)'],
    ['timeBlocks', 'bloqueo(s)'],
    ['deletionRequests', 'solicitud(es) de borrado'],
    ['profiles', 'perfil(es)'],
    ['authUsers', 'usuario(s) de Auth'],
  ] as const)('detecta %s sobrantes', (key, text) => {
    const leftovers = findLeftovers({ ...clean, [key]: 3 }, seed);
    expect(leftovers).toHaveLength(1);
    expect(leftovers[0]).toContain(`3 ${text}`);
  });

  it('un servicio de la semilla que falta no es un resto (solo se buscan sobrantes)', () => {
    expect(findLeftovers({ ...clean, services: ['Corte mujer'] }, seed)).toEqual([]);
  });
});
