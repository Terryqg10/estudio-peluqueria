import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { anonClient, createUser, service, cleanup } from './helpers/db';

// Cupo de envíos del enlace mágico (ADR-0021, T-007): por email y por IP, por ventana. Las claves
// son hashes (nunca el email ni la IP). Solo `service_role` puede llamar a la función.
const hash = () => randomBytes(32).toString('hex');
const created: string[] = [];
const fresh = () => {
  const value = hash();
  created.push(value);
  return value;
};

describe('limite-acceso: consume_login_link_quota', () => {
  afterAll(async () => {
    if (created.length > 0) await service.from('rate_limits').delete().in('key_hash', created);
    await cleanup();
  });

  it('permite hasta el máximo por email y rechaza el siguiente con LIMIT_EMAIL', async () => {
    const email = fresh();
    for (let i = 0; i < 3; i++) {
      const { error } = await service.rpc('consume_login_link_quota', { p_email_hash: email });
      expect(error).toBeNull();
    }
    const { error } = await service.rpc('consume_login_link_quota', { p_email_hash: email });
    expect(error?.message).toBe('LIMIT_EMAIL');
  });

  it('otro email no comparte cupo', async () => {
    const { error } = await service.rpc('consume_login_link_quota', { p_email_hash: fresh() });
    expect(error).toBeNull();
  });

  it('limita por IP aunque cambie el email, con LIMIT_IP', async () => {
    const ip = fresh();
    for (let i = 0; i < 2; i++) {
      const { error } = await service.rpc('consume_login_link_quota', {
        p_email_hash: fresh(),
        p_ip_hash: ip,
        p_max_per_ip: 2,
      });
      expect(error).toBeNull();
    }
    const { error } = await service.rpc('consume_login_link_quota', {
      p_email_hash: fresh(),
      p_ip_hash: ip,
      p_max_per_ip: 2,
    });
    expect(error?.message).toBe('LIMIT_IP');
  });

  it('un rechazo no consume cupo (no se registra la fila)', async () => {
    const email = fresh();
    await service.rpc('consume_login_link_quota', { p_email_hash: email, p_max_per_email: 1 });
    await service.rpc('consume_login_link_quota', { p_email_hash: email, p_max_per_email: 1 });
    const { count } = await service
      .from('rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('key_hash', email);
    expect(count).toBe(1);
  });

  it('dos peticiones simultáneas no superan el máximo', async () => {
    const email = fresh();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        service.rpc('consume_login_link_quota', { p_email_hash: email, p_max_per_email: 3 }),
      ),
    );
    expect(results.filter((r) => r.error === null)).toHaveLength(3);
    expect(results.filter((r) => r.error?.message === 'LIMIT_EMAIL')).toHaveLength(3);
  });

  it('rechaza claves con forma inválida', async () => {
    const { error } = await service.rpc('consume_login_link_quota', { p_email_hash: 'corta' });
    expect(error?.message).toBe('INVALID_INPUT');
  });

  it('anon y clientas autenticadas no pueden llamarla ni leer rate_limits', async () => {
    const anon = await anonClient().rpc('consume_login_link_quota', { p_email_hash: hash() });
    expect(anon.error?.code).toBe('42501');

    const user = await createUser('cupo-acceso');
    const authed = await user.client.rpc('consume_login_link_quota', { p_email_hash: hash() });
    expect(authed.error?.code).toBe('42501');

    const read = await user.client.from('rate_limits').select('id');
    expect(read.data ?? []).toEqual([]);
  });
});
