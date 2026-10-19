import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addTimeBlock,
  anonClient,
  cleanup,
  createService,
  createStylist,
  createUser,
  ensureSalonHours,
  insertAppointment,
  offerService,
  service,
  setSchedule,
} from './helpers/db';
import { madridInstant, sundayDateAhead } from './helpers/time';

// create_booking (ADR-0015). CA-08: carrera de peticiones; CA-10: validación y creación;
// CA-25: consentimiento con fecha y versión. Solo service_role puede ejecutarla.
// Un domingo con horario 10:00–14:00; servicio de 15 min para poder reservar huecos contiguos
// sin que se pisen, y uno de 60 min para las comprobaciones de duración.
const SUNDAY = 7;

const GOOD = {
  p_guest_name: 'Ana García',
  p_guest_email: 'ana@test.invalid',
  p_guest_phone: '+34 600 000 000',
  p_consent_version: 'borrador-1',
};

describe('reserva: create_booking', () => {
  const date = sundayDateAhead(14);
  const at = (hour: number, minute = 0) => madridInstant(date, hour, minute);

  let stylistA: string;
  let stylistB: string;
  let svc15: string;
  let svc60: string;

  const book = (over: Record<string, unknown> = {}) =>
    service.rpc('create_booking', {
      p_service_id: svc15,
      p_stylist_id: stylistA,
      p_starts_at: at(10, 30),
      ...GOOD,
      ...over,
    });

  beforeAll(async () => {
    await ensureSalonHours(SUNDAY, '10:00', '20:00');
    stylistA = await createStylist('Estilista A');
    stylistB = await createStylist('Estilista B'); // no hace svc15 ni svc60
    svc15 = await createService(15);
    svc60 = await createService(60);
    await setSchedule(stylistA, SUNDAY, '10:00', '14:00');
    await setSchedule(stylistB, SUNDAY, '10:00', '14:00');
    await offerService(stylistA, svc15);
    await offerService(stylistA, svc60);
  });

  afterAll(async () => {
    await service.from('appointments').delete().like('guest_email', '%@test.invalid');
    await cleanup();
  });

  describe('CA-10 y CA-25: creación y validación', () => {
    it('crea una cita confirmada de invitada con consentimiento (fecha y versión)', async () => {
      const start = at(10, 0);
      const { data, error } = await book({ p_starts_at: start, p_guest_email: '  Ana@Test.Invalid ' });
      expect(error).toBeNull();
      const created = data?.[0];
      expect(created?.appointment_id).toBeTruthy();
      expect(new Date(created?.starts_at ?? '').getTime()).toBe(new Date(start).getTime());
      expect(new Date(created?.ends_at ?? '').getTime() - new Date(start).getTime()).toBe(15 * 60_000);

      const row = await service
        .from('appointments')
        .select('status, user_id, guest_name, guest_email, guest_phone, consent_at, consent_version')
        .eq('id', created?.appointment_id ?? '')
        .single();
      expect(row.data?.status).toBe('confirmed');
      expect(row.data?.user_id).toBeNull();
      expect(row.data?.guest_email).toBe('ana@test.invalid'); // normalizado
      expect(row.data?.guest_name).toBe('Ana García');
      expect(row.data?.consent_version).toBe('borrador-1');
      const age = Date.now() - new Date(row.data?.consent_at ?? 0).getTime();
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(60_000);
    });

    it('acepta formatos habituales de teléfono, también con paréntesis', async () => {
      for (const [i, phone] of ['600 000 000', '+34 600 000 000', '(91) 123 45 67', '600-000-000'].entries()) {
        const { error } = await book({ p_starts_at: at(12, 15 + 15 * i % 45), p_guest_phone: phone, p_guest_email: `tel${i}@test.invalid` });
        // El hueco puede estar bloqueado por otro test: lo único que no debe ocurrir es INVALID_INPUT.
        expect(error?.message).not.toBe('INVALID_INPUT');
      }
    });

    it('la duración de la cita es la del servicio (60 min)', async () => {
      const start = at(11, 0);
      const { data, error } = await book({ p_service_id: svc60, p_starts_at: start });
      expect(error).toBeNull();
      const created = data?.[0];
      expect(new Date(created?.ends_at ?? '').getTime() - new Date(start).getTime()).toBe(60 * 60_000);
    });

    it('no emite el token de gestión (lo hace T-006 al enviar el email)', async () => {
      const { data, error } = await book({ p_starts_at: at(10, 15) });
      expect(error).toBeNull();
      const id = data?.[0]?.appointment_id ?? '';
      expect(id).not.toBe('');
      const tokens = await service.from('appointment_tokens').select('appointment_id').eq('appointment_id', id);
      expect(tokens.data).toEqual([]);
    });

    it.each([
      ['nombre demasiado corto', { p_guest_name: 'A' }],
      ['nombre vacío', { p_guest_name: '   ' }],
      ['email sin dominio', { p_guest_email: 'ana@' }],
      ['email con espacios', { p_guest_email: 'a na@test.invalid' }],
      ['teléfono con letras', { p_guest_phone: 'abc12345678' }],
      ['teléfono demasiado corto', { p_guest_phone: '12345' }],
    ])('rechaza %s y no crea la cita', async (_name, over) => {
      const email = 'rechazo@test.invalid';
      const { data, error } = await book({ p_guest_email: email, ...over });
      expect(data).toBeNull();
      expect(error?.message).toBe('INVALID_INPUT');
      const rows = await service.from('appointments').select('id').eq('guest_email', email);
      expect(rows.data).toEqual([]);
    });

    it('CA-25: sin consentimiento (versión vacía) se rechaza y no se crea la cita', async () => {
      const email = 'sinconsentimiento@test.invalid';
      for (const version of ['', '   ']) {
        const { error } = await book({ p_guest_email: email, p_consent_version: version });
        expect(error?.message).toBe('INVALID_INPUT');
      }
      const rows = await service.from('appointments').select('id').eq('guest_email', email);
      expect(rows.data).toEqual([]);
    });
  });

  describe('selección y ventana', () => {
    it('INVALID_SELECTION: estilista que no hace el servicio, y servicio o estilista inactivos', async () => {
      expect((await book({ p_stylist_id: stylistB })).error?.message).toBe('INVALID_SELECTION');

      const inactiveService = await createService(30);
      await offerService(stylistA, inactiveService);
      await service.from('services').update({ active: false }).eq('id', inactiveService);
      expect((await book({ p_service_id: inactiveService })).error?.message).toBe('INVALID_SELECTION');

      const inactiveStylist = await createStylist('Inactiva');
      await setSchedule(inactiveStylist, SUNDAY, '10:00', '14:00');
      await offerService(inactiveStylist, svc15);
      await service.from('stylists').update({ active: false }).eq('id', inactiveStylist);
      expect((await book({ p_stylist_id: inactiveStylist })).error?.message).toBe('INVALID_SELECTION');
    });

    it('OUT_OF_WINDOW: con menos de 2 h o a más de 60 días', async () => {
      const soon = new Date(Date.now() + 60 * 60_000).toISOString();
      const far = new Date(Date.now() + 70 * 24 * 3_600_000).toISOString();
      expect((await book({ p_starts_at: soon })).error?.message).toBe('OUT_OF_WINDOW');
      expect((await book({ p_starts_at: far })).error?.message).toBe('OUT_OF_WINDOW');
    });

    it('SLOT_TAKEN: hora fuera de la rejilla, fuera de horario o que no cabe', async () => {
      expect((await book({ p_starts_at: at(10, 7) })).error?.message).toBe('SLOT_TAKEN'); // no es múltiplo de 15
      expect((await book({ p_starts_at: at(9, 0) })).error?.message).toBe('SLOT_TAKEN'); // antes de abrir
      expect((await book({ p_service_id: svc60, p_starts_at: at(13, 30) })).error?.message).toBe(
        'SLOT_TAKEN',
      ); // 60 min acabarían a las 14:30
    });

    it('SLOT_TAKEN: hueco bloqueado por vacaciones o descanso de la estilista', async () => {
      await addTimeBlock(stylistA, new Date(at(12, 0)), 60); // 12:00–13:00
      expect((await book({ p_starts_at: at(12, 15) })).error?.message).toBe('SLOT_TAKEN');
    });

    it('SLOT_TAKEN: hueco ocupado por otra cita activa', async () => {
      await insertAppointment({
        stylistId: stylistA,
        serviceId: svc60,
        start: new Date(at(13, 0)),
        minutes: 30,
      }); // 13:00–13:30
      expect((await book({ p_starts_at: at(13, 15) })).error?.message).toBe('SLOT_TAKEN');
    });
  });

  describe('CA-08: reservas simultáneas', () => {
    it('con 2 peticiones a la vez del mismo hueco, exactamente una confirma y la otra recibe SLOT_TAKEN', async () => {
      const start = at(13, 30);
      const results = await Promise.all([
        book({ p_starts_at: start, p_guest_email: 'carrera1@test.invalid' }),
        book({ p_starts_at: start, p_guest_email: 'carrera2@test.invalid' }),
      ]);
      expect(results.filter((r) => r.error === null)).toHaveLength(1);
      expect(results.filter((r) => r.error?.message === 'SLOT_TAKEN')).toHaveLength(1);

      const rows = await service
        .from('appointments')
        .select('id')
        .in('guest_email', ['carrera1@test.invalid', 'carrera2@test.invalid']);
      expect(rows.data).toHaveLength(1);
    });

    it('con 6 peticiones a la vez, solo una entra y las demás reciben SLOT_TAKEN (ningún otro error)', async () => {
      const start = at(13, 45);
      const emails = Array.from({ length: 6 }, (_, i) => `multi${i}@test.invalid`);
      const results = await Promise.all(
        emails.map((email) => book({ p_starts_at: start, p_guest_email: email })),
      );
      expect(results.filter((r) => r.error === null)).toHaveLength(1);
      expect(results.filter((r) => r.error?.message === 'SLOT_TAKEN')).toHaveLength(5);

      const rows = await service.from('appointments').select('id').in('guest_email', emails);
      expect(rows.data).toHaveLength(1);
    });
  });

  describe('permisos (ADR-0015)', () => {
    it('anon y una clienta con cuenta no pueden ejecutar create_booking', async () => {
      const args = {
        p_service_id: svc15,
        p_stylist_id: stylistA,
        p_starts_at: at(10, 45),
        ...GOOD,
      };
      const anon = await anonClient().rpc('create_booking', args);
      expect(anon.error?.code).toBe('42501');

      const clienta = await createUser('clienta-reserva');
      const auth = await clienta.client.rpc('create_booking', args);
      expect(auth.error?.code).toBe('42501');

      // Ninguno de los dos intentos creó una cita en ese hueco.
      const start = at(10, 45);
      const end = new Date(new Date(start).getTime() + 15 * 60_000).toISOString();
      const rows = await service
        .from('appointments')
        .select('id')
        .eq('stylist_id', stylistA)
        .overlaps('during', `[${start},${end})`);
      expect(rows.data).toEqual([]);
    });
  });
});
