import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanup,
  createService,
  createStylist,
  createUser,
  daysFromNow,
  insertAppointment,
  service,
} from './helpers/db';

// CA-27 (RF-09, ADR-0030): al ejecutar la retención se anonimizan los datos cuya última cita tiene
// más de 24 meses; los más recientes no se tocan.
describe('retencion (CA-27)', () => {
  let stylistId: string;
  let serviceId: string;

  // 24 meses ≈ 730 días. Se usan márgenes amplios a ambos lados.
  const OLD = -800;
  const RECENT = -600;

  beforeAll(async () => {
    stylistId = await createStylist();
    serviceId = await createService(60);
  });

  afterAll(cleanup);

  async function row(id: string) {
    const { data, error } = await service.from('appointments').select('*').eq('id', id).single();
    expect(error).toBeNull();
    return data!;
  }

  async function run(months = 24) {
    const { data, error } = await service.rpc('anonymize_expired_data', { p_months: months });
    expect(error).toBeNull();
    return data![0]!;
  }

  it('anonimiza a la invitada con la última cita de hace más de 24 meses y no a la reciente', async () => {
    const oldEmail = `vieja-${randomUUID()}@test.invalid`;
    const recentEmail = `reciente-${randomUUID()}@test.invalid`;
    const old = await insertAppointment({ stylistId, serviceId, start: daysFromNow(OLD, 10), guestEmail: oldEmail });
    const recent = await insertAppointment({ stylistId, serviceId, start: daysFromNow(RECENT, 10), guestEmail: recentEmail });
    await service.rpc('issue_management_token', { p_appointment_id: old.data!.id });

    const result = await run();
    expect(result.appointments_anonymized).toBeGreaterThanOrEqual(1);

    const a = await row(old.data!.id);
    expect(a.anonymized_at).not.toBeNull();
    expect([a.guest_name, a.guest_email, a.guest_phone, a.consent_at, a.consent_version]).toEqual([
      null, null, null, null, null,
    ]);
    const tokens = await service.from('appointment_tokens').select('appointment_id').eq('appointment_id', old.data!.id);
    expect(tokens.data).toEqual([]);

    const r = await row(recent.data!.id);
    expect(r.anonymized_at).toBeNull();
    expect(r.guest_email).toBe(recentEmail);
  });

  it('una cita reciente o futura protege todo el histórico de la misma persona', async () => {
    const email = `mixta-${randomUUID()}@test.invalid`;
    const old = await insertAppointment({ stylistId, serviceId, start: daysFromNow(OLD - 5, 10), guestEmail: email });
    const future = await insertAppointment({ stylistId, serviceId, start: daysFromNow(90, 10), guestEmail: email });

    await run();

    expect((await row(old.data!.id)).anonymized_at).toBeNull();
    const f = await row(future.data!.id);
    expect(f.anonymized_at).toBeNull();
    expect(f.status).toBe('confirmed');
  });

  it('cuentas: anonimiza citas y perfil de la clienta inactiva y conserva la cuenta y a la activa', async () => {
    const inactive = await createUser('retencion-inactiva');
    const active = await createUser('retencion-activa');
    await service.from('profiles').update({ full_name: 'Vieja', phone: '+34633333333' }).eq('id', inactive.id);
    await service.from('profiles').update({ full_name: 'Activa', phone: '+34644444444' }).eq('id', active.id);
    const oldA = await insertAppointment({ stylistId, serviceId, start: daysFromNow(OLD - 10, 10), userId: inactive.id });
    const oldB = await insertAppointment({ stylistId, serviceId, start: daysFromNow(OLD - 30, 10), userId: active.id });
    const recent = await insertAppointment({ stylistId, serviceId, start: daysFromNow(RECENT - 10, 10), userId: active.id });

    await run();

    expect((await row(oldA.data!.id)).anonymized_at).not.toBeNull();
    expect((await row(oldA.data!.id)).user_id).toBeNull();
    const p = await service.from('profiles').select('full_name, phone').eq('id', inactive.id).single();
    expect(p.data).toEqual({ full_name: null, phone: null });
    const authUser = await service.auth.admin.getUserById(inactive.id);
    expect(authUser.data.user?.id).toBe(inactive.id);

    expect((await row(oldB.data!.id)).anonymized_at).toBeNull();
    expect((await row(recent.data!.id)).anonymized_at).toBeNull();
    const pa = await service.from('profiles').select('full_name').eq('id', active.id).single();
    expect(pa.data?.full_name).toBe('Activa');
  });

  it('el plazo es configurable y se valida', async () => {
    const email = `plazo-${randomUUID()}@test.invalid`;
    const mid = await insertAppointment({ stylistId, serviceId, start: daysFromNow(-100, 10), guestEmail: email });

    await run(24);
    expect((await row(mid.data!.id)).anonymized_at).toBeNull();

    await run(2);
    expect((await row(mid.data!.id)).anonymized_at).not.toBeNull();

    for (const bad of [0, -1, 121]) {
      const { error } = await service.rpc('anonymize_expired_data', { p_months: bad });
      expect(error?.message).toBe('INVALID_INPUT');
    }
  });

  it('purga los registros de límites de más de 24 h y conserva los recientes', async () => {
    const stale = `${randomUUID()}${randomUUID()}`.replaceAll('-', '');
    const fresh = `${randomUUID()}${randomUUID()}`.replaceAll('-', '');
    const inserted = await service.from('rate_limits').insert([
      { kind: 'ip', key_hash: stale, created_at: new Date(Date.now() - 25 * 3600_000).toISOString() },
      { kind: 'ip', key_hash: fresh, created_at: new Date().toISOString() },
    ]);
    expect(inserted.error).toBeNull();

    const result = await run();
    expect(result.rate_limits_purged).toBeGreaterThanOrEqual(1);

    const left = await service.from('rate_limits').select('key_hash').in('key_hash', [stale, fresh]);
    expect(left.data?.map((r) => r.key_hash)).toEqual([fresh]);
    await service.from('rate_limits').delete().eq('key_hash', fresh);
  });

  it('es idempotente: una segunda ejecución no anonimiza nada más de lo ya hecho', async () => {
    const email = `idem-${randomUUID()}@test.invalid`;
    await insertAppointment({ stylistId, serviceId, start: daysFromNow(OLD - 20, 10), guestEmail: email });
    await run();
    const second = await run();
    expect(second.appointments_anonymized).toBe(0);
  });
});
