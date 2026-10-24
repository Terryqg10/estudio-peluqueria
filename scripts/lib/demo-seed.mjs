// Plan de las citas de ejemplo de la demo (T-029, ADR-0036). Puro y sin red para poder probarlo con tests unitarios:
// `demo-seed.mjs` lo ejecuta contra la BD. Todo es ficticio (emails `.invalid`, teléfonos de marcador).

const TIME_ZONE = 'Europe/Madrid';

// Días respecto a hoy: de 1 atrás a 13 adelante (dos semanas de agenda, casi toda por venir: T-032).
export const FIRST_DAY_OFFSET = -1;
export const LAST_DAY_OFFSET = 13;

// Los bloqueos y vacaciones de ejemplo llevan esta marca en la nota: es lo que permite borrarlos sin tocar los reales.
export const SAMPLE_NOTE_MARK = '(ejemplo)';

const NAMES = [
  'Marta Beltrán Ruiz',
  'Elena Castaño Vidal',
  'Paula Ferrer Núñez',
  'Sara Lozano Prieto',
  'Nuria Cabrera Sanz',
  'Alba Herrero Gil',
  'Cristina Mora Pons',
  'Laura Ibáñez Cano',
  'Marina Serrano Vega',
  'Beatriz Pastor Lara',
  'Rocío Navarro Dueñas',
  'Irene Campos Roldán',
  'Julia Esteban Moya',
  'Silvia Redondo Arce',
];

const NOTES = [
  'Alergia al amoníaco (ejemplo).',
  'Prefiere el tono más frío (ejemplo).',
  'Viene con prisa: acabar antes de las 13:00 (ejemplo).',
];

const pad = (n) => String(n).padStart(2, '0');

function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1, d + days));
  return `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
}

function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
}

// Minutos que Madrid va por delante de UTC en un instante (60 en invierno, 120 en verano).
function madridOffsetMinutes(utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - Math.floor(utcMs / 60000) * 60000) / 60000);
}

// «2026-10-26» y «10:00» (hora de Madrid) → instante UTC en ISO.
export function madridToUtcIso(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  const first = guess - madridOffsetMinutes(guess) * 60000;
  return new Date(guess - madridOffsetMinutes(first) * 60000).toISOString();
}

function slug(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.|\.$/g, '');
}

// Reparto determinista: dos huecos por estilista y día (mañana y tarde; el sábado, solo mañana), con unos cuantos
// libres para que parezca real. Ningún par de citas de una estilista se solapa: la mañana empieza a las 10 u 11 y dura
// como mucho 3 h, y la tarde a las 16 o 17.
export function planSampleAppointments({ today, stylists }) {
  const plan = [];
  let counter = 0;

  for (let dayOffset = FIRST_DAY_OFFSET; dayOffset <= LAST_DAY_OFFSET; dayOffset++) {
    const date = addDays(today, dayOffset);
    const weekday = weekdayOf(date);
    if (weekday === 0) continue; // domingo: cerrado
    const saturday = weekday === 6;

    stylists.forEach((stylist, i) => {
      const slots = saturday ? [0] : [0, 1];
      for (const k of slots) {
        if (((dayOffset + 5) * 3 + i * 5 + k * 7) % 3 === 0) continue; // hueco libre

        // El sábado el salón cierra a las 14:00: servicios de hasta 2 h empezando a las 10.
        const candidates = stylist.services
          .filter((s) => (saturday ? s.durationMin <= 120 : true))
          .sort((a, b) => a.name.localeCompare(b.name, 'es'));
        if (candidates.length === 0) continue;
        const service = candidates[((dayOffset + 10) * 2 + i + k) % candidates.length];
        if (!service) continue;

        const startHour = saturday ? 10 : (k === 0 ? 10 : 16) + ((dayOffset + i + 8) % 2);
        const name = NAMES[counter % NAMES.length] ?? NAMES[0];
        const cancelled = dayOffset >= 0 && (dayOffset + i + k) % 11 === 0;
        const status = cancelled ? 'cancelled' : dayOffset < 0 ? ((counter % 7) === 6 ? 'no_show' : 'completed') : 'confirmed';

        plan.push({
          stylistId: stylist.id,
          serviceId: service.id,
          date,
          time: `${pad(startHour)}:00`,
          minutes: service.durationMin,
          status,
          name,
          phone: `+34 600 000 0${pad(10 + (counter % 90))}`,
          email: `${slug(name.split(' ').slice(0, 2).join(' '))}.${counter}@ejemplo.invalid`,
          note: counter % 4 === 1 ? (NOTES[counter % NOTES.length] ?? NOTES[0]) : null,
        });
        counter++;
      }
    });
  }
  return plan;
}

// Vacaciones y un bloqueo de franja de ejemplo (T-032), para que el panel enseñe «Bloqueos y vacaciones». Puro y determinista.
// Las vacaciones (7 días, de 16 a 22 días vista) no coinciden con ninguna cita de ejemplo (llegan hasta +13); el bloqueo (14:00–16:00
// de un día laborable cercano) cae entre la mañana y la tarde de las citas de ejemplo.
export function planSampleBlocks({ today, stylists }) {
  const blocks = [];
  const vacationStylist = stylists[1] ?? stylists[0];
  if (vacationStylist) {
    const from = addDays(today, 16);
    const to = addDays(today, 22);
    blocks.push({
      stylistId: vacationStylist.id,
      kind: 'vacation',
      startsAt: madridToUtcIso(from, '00:00'),
      endsAt: madridToUtcIso(addDays(to, 1), '00:00'),
      note: `Vacaciones de verano ${SAMPLE_NOTE_MARK}`,
    });
  }

  const blockStylist = stylists[0];
  if (blockStylist) {
    let date = addDays(today, 4);
    while (weekdayOf(date) === 0 || weekdayOf(date) === 6) date = addDays(date, 1); // laborable (lunes a viernes)
    blocks.push({
      stylistId: blockStylist.id,
      kind: 'block',
      startsAt: madridToUtcIso(date, '14:00'),
      endsAt: madridToUtcIso(date, '16:00'),
      note: `Formación ${SAMPLE_NOTE_MARK}`,
    });
  }
  return blocks;
}
