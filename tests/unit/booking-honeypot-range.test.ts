import { describe, expect, it } from 'vitest';
import { confirmationCookieOptions } from '@/lib/booking/confirmation-cookie';
import { isHoneypotTriggered } from '@/lib/booking/honeypot';
import { parseRange } from '@/lib/booking/range';
import { parseServerEnv } from '@/lib/env.server';

describe('isHoneypotTriggered (CA-28)', () => {
  it('se activa solo si el campo `website` trae contenido', () => {
    expect(isHoneypotTriggered({ website: 'http://spam.example' })).toBe(true);
    expect(isHoneypotTriggered({ website: ' x ' })).toBe(true);
  });

  it.each([
    ['vacío', { website: '' }],
    ['solo espacios', { website: '   ' }],
    ['ausente', {}],
    ['no es texto', { website: 5 }],
    ['entrada nula', null],
    ['entrada que no es objeto', 'hola'],
  ])('no se activa con %s', (_name, input) => {
    expect(isHoneypotTriggered(input)).toBe(false);
  });
});

describe('parseRange', () => {
  it('interpreta el rango de PostgREST con huso «+00»', () => {
    expect(parseRange('["2026-11-02 09:00:00+00","2026-11-02 10:00:00+00")')).toEqual({
      start: '2026-11-02T09:00:00.000Z',
      end: '2026-11-02T10:00:00.000Z',
    });
  });

  it('respeta husos distintos de UTC', () => {
    expect(parseRange('["2026-11-02 10:00:00+01","2026-11-02 11:00:00+01")')?.start).toBe(
      '2026-11-02T09:00:00.000Z',
    );
  });

  it.each([null, undefined, 5, '', 'no es un rango', '[,)', '["x","y")'])('devuelve null con %s', (value) => {
    expect(parseRange(value)).toBeNull();
  });
});

describe('confirmationCookieOptions', () => {
  it('es httpOnly, de corta duración y limitada a /reservar', () => {
    const options = confirmationCookieOptions(null);
    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe('/reservar');
    expect(options.sameSite).toBe('lax');
    expect(options.maxAge).toBe(600);
  });

  it('solo es Secure si la petición real llegó por HTTPS (WebKit rechaza Secure sobre http://localhost)', () => {
    expect(confirmationCookieOptions('https').secure).toBe(true);
    expect(confirmationCookieOptions('https, http').secure).toBe(true);
    expect(confirmationCookieOptions('http').secure).toBe(false);
    expect(confirmationCookieOptions(null).secure).toBe(false);
  });
});

describe('parseServerEnv (ADR-0015)', () => {
  it('acepta URL y clave de servicio', () => {
    expect(
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_SERVICE_ROLE_KEY: 'clave-de-ejemplo',
      }),
    ).toEqual({ supabaseUrl: 'http://127.0.0.1:54321', serviceRoleKey: 'clave-de-ejemplo' });
  });

  it('devuelve null si falta la clave o la URL no es válida', () => {
    expect(parseServerEnv({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' })).toBeNull();
    expect(
      parseServerEnv({ NEXT_PUBLIC_SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'k' }),
    ).toBeNull();
    expect(
      parseServerEnv({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: '' }),
    ).toBeNull();
  });
});
