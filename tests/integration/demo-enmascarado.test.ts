import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAdminAppointment } from '../../src/lib/admin/manage-appointment';
import { loadWeekAgenda } from '../../src/lib/admin/load-week-agenda';
import { mondayOf } from '../../src/lib/admin/week';
import { madridDateOf } from '../../src/lib/booking/dates';
import {
  anonClient,
  cleanup,
  createAdmin,
  createDemo,
  createService,
  createStylist,
  createUser,
  daysFromNow,
  insertAppointment,
  service,
  type TestUser,
} from './helpers/db';

// T-026 (ADR-0036, CA-50): la cuenta demo lee las citas por las vistas del panel, con los datos personales de las
// citas de visitantes enmascarados y los de las citas de ejemplo completos. La tabla base no es legible por `demo`.
describe('demo-enmascarado (CA-50)', () => {
  let admin: TestUser;
  let demo: TestUser;
  let clienta: TestUser;
  let visitorId = '';
  let sampleId = '';
  let accountId = '';

  beforeAll(async () => {
    const stylistId = await createStylist();
    const serviceId = await createService(60);
    admin = await createAdmin();
    demo = await createDemo();
    clienta = await createUser('clienta');

    const visitor = await insertAppointment({
      stylistId,
      serviceId,
      start: daysFromNow(30, 10),
      guestName: 'María García López',
      guestEmail: 'maria@correo.test',
      guestPhone: '+34 612 345 678',
    });
    visitorId = visitor.data?.id ?? '';
    const sample = await insertAppointment({
      stylistId,
      serviceId,
      start: daysFromNow(30, 12),
      guestName: 'Lucía Ejemplo Demo',
      guestEmail: 'lucia@ejemplo.test',
      guestPhone: '+34 600 111 222',
      isSample: true,
    });
    sampleId = sample.data?.id ?? '';
    const account = await insertAppointment({
      stylistId,
      serviceId,
      start: daysFromNow(30, 14),
      userId: clienta.id,
    });
    accountId = account.data?.id ?? '';
    expect([visitorId, sampleId, accountId].every((id) => id !== '')).toBe(true);

    await service.from('profiles').update({ full_name: 'Carmen Ruiz Soto', phone: '+34 655 000 999' }).eq('id', clienta.id);
    for (const id of [visitorId, sampleId]) {
      const note = await service.from('appointment_notes').insert({ appointment_id: id, note: `Nota privada ${id}` });
      expect(note.error).toBeNull();
    }
  });

  afterAll(cleanup);

  const ids = () => [visitorId, sampleId, accountId];

  it('el Admin real ve los datos completos de todas las citas', async () => {
    const { data, error } = await admin.client
      .from('panel_appointments')
      .select('id, guest_name, guest_email, guest_phone, profile_name, profile_phone, user_id')
      .in('id', ids());
    expect(error).toBeNull();
    const byId = new Map((data ?? []).map((row) => [row.id, row]));
    expect(byId.get(visitorId)).toMatchObject({
      guest_name: 'María García López',
      guest_email: 'maria@correo.test',
      guest_phone: '+34 612 345 678',
    });
    expect(byId.get(accountId)).toMatchObject({
      profile_name: 'Carmen Ruiz Soto',
      profile_phone: '+34 655 000 999',
      user_id: clienta.id,
    });
  });

  it('la cuenta demo ve enmascaradas las citas de visitantes', async () => {
    const { data, error } = await demo.client
      .from('panel_appointments')
      .select('id, guest_name, guest_email, guest_phone, profile_name, profile_phone, user_id')
      .in('id', ids());
    expect(error).toBeNull();
    const byId = new Map((data ?? []).map((row) => [row.id, row]));

    expect(byId.get(visitorId)).toMatchObject({
      guest_name: 'María G.',
      guest_email: 'm•••@•••',
      guest_phone: '•••• 678',
    });
    // Cita de cuenta: ni el nombre del perfil ni el id de la cuenta salen.
    expect(byId.get(accountId)).toMatchObject({ profile_name: 'Carmen R.', profile_phone: '•••• 999', user_id: null });

    const serialized = JSON.stringify(data);
    for (const secret of ['García', 'López', 'maria@correo', '612', 'Ruiz', 'Soto', '655', clienta.id]) {
      expect(serialized, `no debe filtrar ${secret}`).not.toContain(secret);
    }
  });

  it('la cuenta demo ve completas las citas de ejemplo', async () => {
    const { data } = await demo.client
      .from('panel_appointments')
      .select('guest_name, guest_email, guest_phone, is_sample')
      .eq('id', sampleId);
    expect(data).toEqual([
      {
        guest_name: 'Lucía Ejemplo Demo',
        guest_email: 'lucia@ejemplo.test',
        guest_phone: '+34 600 111 222',
        is_sample: true,
      },
    ]);
  });

  it('las notas internas solo se leen en las citas de ejemplo', async () => {
    const { data, error } = await demo.client
      .from('panel_appointment_notes')
      .select('appointment_id, note')
      .in('appointment_id', ids());
    expect(error).toBeNull();
    expect(data).toEqual([{ appointment_id: sampleId, note: `Nota privada ${sampleId}` }]);

    const adminNotes = await admin.client
      .from('panel_appointment_notes')
      .select('appointment_id')
      .in('appointment_id', ids());
    expect((adminNotes.data ?? []).length).toBe(2);
  });

  it('la tabla base y los perfiles no son legibles por la cuenta demo', async () => {
    for (const table of ['appointments', 'appointment_notes', 'appointment_tokens'] as const) {
      const { data } = await demo.client.from(table).select('*');
      expect(data ?? [], table).toEqual([]);
    }
    const profiles = await demo.client.from('profiles').select('id, full_name').eq('id', clienta.id);
    expect(profiles.data ?? []).toEqual([]);
  });

  it('una clienta y el público anónimo no leen las vistas del panel', async () => {
    for (const client of [clienta.client, anonClient()]) {
      for (const view of ['panel_appointments', 'panel_appointment_notes'] as const) {
        const { data, error } = await client.from(view).select('*');
        expect(error !== null || (data ?? []).length === 0, view).toBe(true);
      }
    }
    // Una clienta sin rol no recibe filas aunque tenga permiso de lectura de la vista.
    const own = await clienta.client.from('panel_appointments').select('id').eq('id', accountId);
    expect(own.data ?? []).toEqual([]);
  });

  it('el panel carga la agenda y la ficha con la sesión demo, enmascarada, y con la del Admin, completa', async () => {
    const monday = mondayOf(madridDateOf(daysFromNow(30, 10).toISOString()));
    const asDemo = await loadWeekAgenda(demo.client, monday);
    const asAdmin = await loadWeekAgenda(admin.client, monday);
    if (asDemo.state !== 'ok' || asAdmin.state !== 'ok') throw new Error('la agenda debe cargar');

    const demoVisitor = asDemo.appointments.find((a) => a.id === visitorId);
    const adminVisitor = asAdmin.appointments.find((a) => a.id === visitorId);
    expect(demoVisitor).toMatchObject({ clientName: 'María G.', phone: '•••• 678', email: 'm•••@•••' });
    expect(demoVisitor?.serviceName).not.toBe('Servicio');
    expect(adminVisitor).toMatchObject({ clientName: 'María García López', phone: '+34 612 345 678' });
    expect(asDemo.appointments.find((a) => a.id === accountId)?.clientName).toBe('Carmen R.');
    expect(asAdmin.appointments.find((a) => a.id === accountId)?.clientName).toBe('Carmen Ruiz Soto');

    const sheetDemo = await loadAdminAppointment(demo.client, visitorId);
    const sheetAdmin = await loadAdminAppointment(admin.client, visitorId);
    expect(sheetDemo).toMatchObject({ clientName: 'María G.', note: '' });
    expect(sheetAdmin).toMatchObject({ clientName: 'María García López', note: `Nota privada ${visitorId}` });
    const sampleSheet = await loadAdminAppointment(demo.client, sampleId);
    expect(sampleSheet).toMatchObject({ clientName: 'Lucía Ejemplo Demo', note: `Nota privada ${sampleId}` });
  });
});
