import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addTimeBlock,
  anonClient,
  cleanup,
  createService,
  createStylist,
  daysFromNow,
  ensureSalonHours,
  insertAppointment,
  offerService,
  service,
  setSchedule,
} from './helpers/db';

// CA-06 (RF-02): solo se ofrecen inicios donde caben D minutos consecutivos libres.
// ADR-0013 y ADR-0014: cálculo en BD, solo franjas, estilistas que hacen el servicio.
const SUNDAY = 7; // ISO

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Primer domingo (UTC) con al menos `minDays` días de margen.
function sundayAhead(minDays: number): Date {
  const d = daysFromNow(minDays, 12);
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

const madridTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

async function slotsFor(serviceId: string, date: string, stylistId?: string) {
  const { data, error } = await anonClient().rpc('get_availability', {
    p_service_id: serviceId,
    p_date: date,
    ...(stylistId ? { p_stylist_id: stylistId } : {}),
  });
  expect(error).toBeNull();
  return data ?? [];
}

describe('disponibilidad (CA-06)', () => {
  const sunday = sundayAhead(14);
  const date = dateOnly(sunday);
  const at = (hour: number, minute = 0) => {
    const d = new Date(sunday);
    // Hora local de Madrid → UTC: se resuelve con la diferencia real de ese día.
    d.setUTCHours(hour, minute, 0, 0);
    const local = madridTime(d.toISOString());
    const shift = Number(local.slice(0, 2)) - hour; // horas de diferencia (1 o 2)
    d.setUTCHours(hour - shift, minute, 0, 0);
    return d;
  };

  let stylistA: string;
  let stylistB: string;
  let svc60: string;
  let svc150: string;

  beforeAll(async () => {
    await ensureSalonHours(SUNDAY, '10:00', '20:00');
    stylistA = await createStylist('Estilista A');
    stylistB = await createStylist('Estilista B');
    svc60 = await createService(60);
    svc150 = await createService(150);
    await setSchedule(stylistA, SUNDAY, '10:00', '14:00');
    await setSchedule(stylistB, SUNDAY, '10:00', '14:00');
    await offerService(stylistA, svc60);
    await offerService(stylistA, svc150);
    await offerService(stylistB, svc150); // B no hace svc60
  });

  afterAll(cleanup);

  it('ofrece inicios cada 15 min y solo donde cabe la duración (60 min en 10:00–14:00)', async () => {
    const slots = await slotsFor(svc60, date, stylistA);
    const times = slots.map((s) => madridTime(s.starts_at));
    expect(times[0]).toBe('10:00');
    expect(times.at(-1)).toBe('13:00'); // 13:15 acabaría a las 14:15
    expect(times).toHaveLength(13); // 10:00 … 13:00 cada 15 min
    expect(times).toContain('10:15');
  });

  it('con un servicio de 150 min el último inicio es 11:30', async () => {
    const slots = await slotsFor(svc150, date, stylistA);
    const times = slots.map((s) => madridTime(s.starts_at));
    expect(times.at(-1)).toBe('11:30');
    expect(times).not.toContain('11:45');
  });

  it('una cita activa bloquea los inicios que la solapan, pero no los contiguos', async () => {
    const blocked = await insertAppointment({
      stylistId: stylistA,
      serviceId: svc60,
      start: at(11, 0),
      minutes: 60,
    });
    expect(blocked.error).toBeNull();

    const times = (await slotsFor(svc60, date, stylistA)).map((s) => madridTime(s.starts_at));
    expect(times).toContain('10:00'); // termina a las 11:00, contigua
    expect(times).not.toContain('10:15'); // acabaría a las 11:15
    expect(times).not.toContain('11:00');
    expect(times).not.toContain('11:45');
    expect(times).toContain('12:00'); // empieza cuando acaba la cita
  });

  it('una cita cancelada no bloquea', async () => {
    const cancelled = await insertAppointment({
      stylistId: stylistA,
      serviceId: svc60,
      start: at(13, 0),
      minutes: 60,
      status: 'cancelled',
    });
    expect(cancelled.error).toBeNull();
    const times = (await slotsFor(svc60, date, stylistA)).map((s) => madridTime(s.starts_at));
    expect(times).toContain('13:00');
  });

  it('un bloqueo (vacaciones, descanso) de la estilista elimina los huecos que lo solapan', async () => {
    const stylist = await createStylist('Estilista con bloqueo');
    await setSchedule(stylist, SUNDAY, '10:00', '14:00');
    await offerService(stylist, svc60);
    await addTimeBlock(stylist, at(12, 0), 60); // 12:00–13:00

    const times = (await slotsFor(svc60, date, stylist)).map((s) => madridTime(s.starts_at));
    expect(times).toContain('11:00'); // termina a las 12:00
    expect(times).not.toContain('11:15');
    expect(times).not.toContain('12:00');
    expect(times).not.toContain('12:45');
    expect(times).toContain('13:00'); // empieza cuando acaba el bloqueo
  });

  it('las citas de una estilista no afectan a otra', async () => {
    const times = (await slotsFor(svc150, date, stylistB)).map((s) => madridTime(s.starts_at));
    expect(times[0]).toBe('10:00');
    expect(times).toContain('11:00');
  });

  it('solo aparecen las estilistas que hacen el servicio', async () => {
    const forSvc60 = new Set((await slotsFor(svc60, date)).map((s) => s.stylist_id));
    expect(forSvc60.has(stylistA)).toBe(true);
    expect(forSvc60.has(stylistB)).toBe(false); // B no hace svc60

    const forSvc150 = await slotsFor(svc150, date);
    expect(new Set(forSvc150.map((s) => s.stylist_id)).has(stylistB)).toBe(true);

    const explicitB = await slotsFor(svc60, date, stylistB);
    expect(explicitB).toEqual([]);
  });

  it('un servicio o una estilista inactivos no ofrecen huecos', async () => {
    const inactiveService = await createService(30);
    await offerService(stylistA, inactiveService);
    await service.from('services').update({ active: false }).eq('id', inactiveService);
    expect(await slotsFor(inactiveService, date, stylistA)).toEqual([]);

    const inactiveStylist = await createStylist('Estilista inactiva');
    await setSchedule(inactiveStylist, SUNDAY, '10:00', '14:00');
    await offerService(inactiveStylist, svc60);
    await service.from('stylists').update({ active: false }).eq('id', inactiveStylist);
    expect(await slotsFor(svc60, date, inactiveStylist)).toEqual([]);
  });

  it('respeta la ventana de reserva: nada en el pasado ni a más de 60 días', async () => {
    const past = daysFromNow(-7, 12);
    while (past.getUTCDay() !== 0) past.setUTCDate(past.getUTCDate() - 1);
    expect(await slotsFor(svc60, dateOnly(past), stylistA)).toEqual([]);

    const far = sundayAhead(75);
    expect(await slotsFor(svc60, dateOnly(far), stylistA)).toEqual([]);
  });

  it('hoy solo ofrece huecos con al menos 2 h de antelación', async () => {
    const stylist = await createStylist('Estilista de hoy');
    const today = new Date();
    const weekdayToday = ((today.getUTCDay() + 6) % 7) + 1; // ISO
    await ensureSalonHours(weekdayToday, '00:00', '23:45');
    await setSchedule(stylist, weekdayToday, '00:00', '23:45');
    await offerService(stylist, svc60);

    const slots = await slotsFor(svc60, dateOnly(today), stylist);
    const limit = Date.now() + 2 * 60 * 60_000 - 1000;
    for (const s of slots) {
      expect(new Date(s.starts_at).getTime()).toBeGreaterThanOrEqual(limit);
    }
  });

  it('es coherente con Europe/Madrid en domingos de las próximas 8 semanas (incluye cambios de hora)', async () => {
    for (let week = 0; week < 8; week++) {
      const d = sundayAhead(1 + week * 7);
      const slots = await slotsFor(svc60, dateOnly(d), stylistA);
      if (slots.length === 0) continue; // fuera de la ventana de 60 días
      const times = slots.map((s) => madridTime(s.starts_at));
      expect(times[0], `primer hueco ${dateOnly(d)}`).toBe('10:00');
      expect(times.at(-1), `último hueco ${dateOnly(d)}`).toBe('13:00');
      expect(times, `sin duplicados ${dateOnly(d)}`).toHaveLength(new Set(times).size);
    }
  });

  it('devuelve solo estilista e inicio: ningún dato de personas ni de citas', async () => {
    await insertAppointment({ stylistId: stylistA, serviceId: svc60, start: at(10, 0) });
    const slots = await slotsFor(svc60, date, stylistA);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(Object.keys(s).sort()).toEqual(['starts_at', 'stylist_id']);
    }
    expect(JSON.stringify(slots)).not.toContain('invitada@test.invalid');
  });
});
