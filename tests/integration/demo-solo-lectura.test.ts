import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanup,
  createDemo,
  createService,
  createStylist,
  daysFromNow,
  insertAppointment,
  service,
  type TestUser,
} from './helpers/db';

// T-026 (ADR-0036, CA-49): la cuenta demo no puede crear, cambiar ni borrar nada del panel; lo impide la BD, no la
// interfaz. Cada intento se comprueba contra el estado real leído con la clave de servicio.
describe('demo-solo-lectura (CA-49)', () => {
  let demo: TestUser;
  let stylistId = '';
  let serviceId = '';
  let appointmentId = '';

  beforeAll(async () => {
    stylistId = await createStylist('Estilista demo');
    serviceId = await createService(60);
    demo = await createDemo();
    const created = await insertAppointment({ stylistId, serviceId, start: daysFromNow(31, 10) });
    appointmentId = created.data?.id ?? '';
    expect(appointmentId).not.toBe('');
  });

  afterAll(cleanup);

  it('lee el catálogo, los horarios y los bloqueos del panel', async () => {
    const services = await demo.client.from('services').select('id').eq('id', serviceId);
    expect(services.data).toEqual([{ id: serviceId }]);
    const stylists = await demo.client.from('stylists').select('id').eq('id', stylistId);
    expect(stylists.data).toEqual([{ id: stylistId }]);
    for (const table of ['stylist_schedule', 'time_blocks', 'salon_hours', 'stylist_services'] as const) {
      const { error } = await demo.client.from(table).select('*').limit(1);
      expect(error, table).toBeNull();
    }
  });

  it('no puede insertar en ninguna tabla', async () => {
    const attempts = await Promise.all([
      demo.client.from('services').insert({ category: 'X', name: 'Intruso', price_from_cents: 1, duration_min: 30 }),
      demo.client.from('stylists').insert({ name: 'Intrusa' }),
      demo.client.from('salon_hours').insert({ weekday: 1, opens: '03:00', closes: '04:00' }),
      demo.client.from('stylist_schedule').insert({ stylist_id: stylistId, weekday: 1, starts: '03:00', ends: '04:00' }),
      demo.client
        .from('time_blocks')
        .insert({ stylist_id: stylistId, during: '[2030-01-01T10:00:00Z,2030-01-01T11:00:00Z)' }),
      demo.client.from('stylist_services').insert({ stylist_id: stylistId, service_id: serviceId }),
      demo.client
        .from('appointments')
        .insert({ stylist_id: stylistId, service_id: serviceId, during: '[2030-01-01T10:00:00Z,2030-01-01T11:00:00Z)', user_id: demo.id }),
      demo.client.from('appointment_notes').insert({ appointment_id: appointmentId, note: 'intruso' }),
      demo.client.from('profiles').insert({ id: demo.id }),
    ]);
    for (const attempt of attempts) expect(attempt.error).not.toBeNull();

    const intruder = await service.from('services').select('id').eq('name', 'Intruso');
    expect(intruder.data).toEqual([]);
    const notes = await service.from('appointment_notes').select('note').eq('appointment_id', appointmentId);
    expect(notes.data).toEqual([]);
  });

  it('no cambia ni borra filas existentes (cero filas afectadas)', async () => {
    const update = await demo.client
      .from('services')
      .update({ name: 'Renombrado por la demo' })
      .eq('id', serviceId)
      .select('id');
    expect(update.data ?? []).toEqual([]);
    const cancel = await demo.client.from('appointments').update({ status: 'cancelled' }).eq('id', appointmentId).select('id');
    expect(cancel.data ?? []).toEqual([]);
    const del = await demo.client.from('stylists').delete().eq('id', stylistId).select('id');
    expect(del.data ?? []).toEqual([]);
    const delAppt = await demo.client.from('appointments').delete().eq('id', appointmentId).select('id');
    expect(delAppt.data ?? []).toEqual([]);

    const svc = await service.from('services').select('name').eq('id', serviceId).single();
    expect(svc.data?.name).not.toBe('Renombrado por la demo');
    const appt = await service.from('appointments').select('status').eq('id', appointmentId).single();
    expect(appt.data?.status).toBe('confirmed');
    const stylist = await service.from('stylists').select('id').eq('id', stylistId);
    expect(stylist.data).toHaveLength(1);
  });

  it('rechaza todas las funciones de administración', async () => {
    const attempts = await Promise.all([
      demo.client.rpc('admin_cancel_appointment', { p_appointment_id: appointmentId }),
      demo.client.rpc('admin_reschedule_appointment', {
        p_appointment_id: appointmentId,
        p_stylist_id: stylistId,
        p_starts_at: daysFromNow(32, 10).toISOString(),
      }),
      demo.client.rpc('admin_appointment_availability', { p_appointment_id: appointmentId, p_date: '2030-01-01' }),
      demo.client.rpc('admin_create_time_blocks', {
        p_stylist_ids: [stylistId],
        p_kind: 'block',
        p_starts_at: '2030-01-01T10:00:00Z',
        p_ends_at: '2030-01-01T11:00:00Z',
        p_note: '',
      }),
      demo.client.rpc('admin_save_service', {
        p_category: 'X',
        p_name: 'Intruso',
        p_price_from_cents: 100,
        p_duration_min: 30,
        p_active: true,
        p_stylist_ids: [],
        p_id: serviceId,
      }),
      demo.client.rpc('admin_save_weekly_hours', { p_ranges: [], p_stylist_id: stylistId }),
      demo.client.rpc('admin_schedule_conflicts', { p_ranges: [], p_stylist_id: stylistId }),
    ]);
    for (const attempt of attempts) expect(attempt.error, JSON.stringify(attempt.error)).not.toBeNull();

    const appt = await service.from('appointments').select('status').eq('id', appointmentId).single();
    expect(appt.data?.status).toBe('confirmed');
  });

  it('no puede escalar su rol a admin ni cambiar el de otra cuenta', async () => {
    const self = await demo.client.from('profiles').update({ role: 'admin' }).eq('id', demo.id);
    expect(self.error).not.toBeNull();
    const { data } = await service.from('profiles').select('role').eq('id', demo.id).single();
    expect(data?.role).toBe('demo');

    const isAdmin = await demo.client.rpc('is_admin');
    expect(isAdmin.data).toBe(false);
    const isDemo = await demo.client.rpc('is_demo');
    expect(isDemo.data).toBe(true);
  });
});
