// Lógica común de los scripts de la BD local (T-022): `db-reset-local.mjs` y `check-db-clean.mjs`.
// Pura y sin red para poder probarla con tests unitarios. Los scripts SOLO actúan en local: la guarda es
// `isLocalUrl`, y la URL sale de `supabase status`, nunca del entorno.

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

// ¿La URL apunta a una máquina local? Cualquier otra cosa (un proyecto alojado, un host raro, una cadena
// inválida o vacía) cuenta como NO local: falla cerrado.
export function isLocalUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && LOCAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

const unescapeSql = (text) => text.replaceAll("''", "'");

// Nombres de estilistas y servicios de la semilla (`supabase/seed.sql`), para saber qué NO es resto de tests.
// Estilistas: primera cadena de cada fila. Servicios: segunda (la primera es la categoría).
export function parseSeed(sql) {
  const block = (table) => {
    const match = new RegExp(`insert into public\\.${table}\\b[^;]*;`, 'i').exec(sql);
    return match ? match[0] : '';
  };
  const stylists = [...block('stylists').matchAll(/^\s*\(\s*'((?:[^']|'')*)'/gm)].map((m) => unescapeSql(m[1] ?? ''));
  const services = [...block('services').matchAll(/^\s*\(\s*'(?:[^']|'')*'\s*,\s*'((?:[^']|'')*)'/gm)].map((m) =>
    unescapeSql(m[1] ?? ''),
  );
  return { stylists, services };
}

// Restos de pruebas: todo lo que hay en la BD y no es de la semilla. `rate_limits` se ignora a propósito
// (caduca sola, ver T-012 y T-022). Devuelve una lista de frases; vacía = BD limpia.
export function findLeftovers(snapshot, seed) {
  const leftovers = [];
  const known = (names, seeded) => names.filter((name) => !seeded.includes(name));

  const stylists = known(snapshot.stylists, seed.stylists);
  if (stylists.length > 0) leftovers.push(`${stylists.length} estilista(s) fuera de la semilla: ${[...new Set(stylists)].join(', ')}`);

  const services = known(snapshot.services, seed.services);
  if (services.length > 0) {
    const sample = services.slice(0, 3).join(', ');
    leftovers.push(`${services.length} servicio(s) fuera de la semilla: ${sample}${services.length > 3 ? ', …' : ''}`);
  }

  for (const [label, count] of [
    ['cita(s)', snapshot.appointments],
    ['bloqueo(s) de franja', snapshot.timeBlocks],
    ['solicitud(es) de borrado', snapshot.deletionRequests],
    ['perfil(es)', snapshot.profiles],
    ['usuario(s) de Auth', snapshot.authUsers],
  ]) {
    if (count > 0) leftovers.push(`${count} ${label} (la semilla no tiene ninguno)`);
  }
  return leftovers;
}
