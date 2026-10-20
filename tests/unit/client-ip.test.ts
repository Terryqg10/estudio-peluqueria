import { describe, expect, it } from 'vitest';
import { resolveClientIpHash } from '@/lib/booking/client-ip.server';

const headersOf = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

const SALT = 'una-sal-secreta-de-prueba';

describe('resolveClientIpHash (ADR-0020)', () => {
  it('fuera de producción el límite por IP está apagado (ipHash null)', () => {
    expect(resolveClientIpHash({}, headersOf({ 'x-real-ip': '203.0.113.7' }), false)).toEqual({
      ok: true,
      ipHash: null,
    });
  });

  it('fuera de producción se puede activar con RATE_LIMIT_IP_ENFORCE=1 (sal de desarrollo)', () => {
    const result = resolveClientIpHash({ RATE_LIMIT_IP_ENFORCE: '1' }, headersOf({ 'x-real-ip': '203.0.113.7' }), false);
    expect(result.ok && result.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('en producción es un hash hexadecimal que no contiene la IP y es estable', () => {
    const headers = headersOf({ 'x-real-ip': '203.0.113.7' });
    const a = resolveClientIpHash({ RATE_LIMIT_SALT: SALT }, headers, true);
    const b = resolveClientIpHash({ RATE_LIMIT_SALT: SALT }, headers, true);
    expect(a).toEqual(b);
    expect(a.ok && a.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(a)).not.toContain('203.0.113.7');
  });

  it('distinta IP o distinta sal dan distinto hash', () => {
    const one = resolveClientIpHash({ RATE_LIMIT_SALT: SALT }, headersOf({ 'x-real-ip': '203.0.113.7' }), true);
    const two = resolveClientIpHash({ RATE_LIMIT_SALT: SALT }, headersOf({ 'x-real-ip': '203.0.113.8' }), true);
    const salted = resolveClientIpHash({ RATE_LIMIT_SALT: `${SALT}-otra` }, headersOf({ 'x-real-ip': '203.0.113.7' }), true);
    expect(one).not.toEqual(two);
    expect(one).not.toEqual(salted);
  });

  it('usa el primer valor de x-forwarded-for si no hay x-real-ip, e ignora valores que no son IP', () => {
    const viaForwarded = resolveClientIpHash(
      { RATE_LIMIT_SALT: SALT },
      headersOf({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
      true,
    );
    const viaReal = resolveClientIpHash({ RATE_LIMIT_SALT: SALT }, headersOf({ 'x-real-ip': '203.0.113.7' }), true);
    expect(viaForwarded).toEqual(viaReal);

    const junk = resolveClientIpHash({ RATE_LIMIT_SALT: SALT }, headersOf({ 'x-real-ip': "'; drop table x;--" }), true);
    const none = resolveClientIpHash({ RATE_LIMIT_SALT: SALT }, headersOf({}), true);
    expect(junk).toEqual(none); // mismo cubo común: no se puede esquivar el límite mandando basura
  });

  it('en producción sin IP identificable se aplica un cubo común (no se deja pasar sin límite)', () => {
    const result = resolveClientIpHash({ RATE_LIMIT_SALT: SALT }, headersOf({}), true);
    expect(result.ok && result.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('en producción sin sal, o con una sal demasiado corta, falla cerrado', () => {
    expect(resolveClientIpHash({}, headersOf({ 'x-real-ip': '203.0.113.7' }), true)).toEqual({ ok: false });
    expect(resolveClientIpHash({ RATE_LIMIT_SALT: 'corta' }, headersOf({}), true)).toEqual({ ok: false });
  });
});
