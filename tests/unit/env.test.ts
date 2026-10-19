import { describe, expect, it } from 'vitest';
import { parsePublicEnv } from '@/lib/env';

describe('parsePublicEnv', () => {
  it('acepta una URL válida y una clave', () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'clave-de-ejemplo',
      }),
    ).toEqual({ supabaseUrl: 'http://127.0.0.1:54321', supabaseAnonKey: 'clave-de-ejemplo' });
  });

  it('devuelve null si falta una variable', () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' })).toBeNull();
    expect(parsePublicEnv({})).toBeNull();
  });

  it('devuelve null si la URL no es válida o la clave está vacía', () => {
    expect(
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: 'no-es-url', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x' }),
    ).toBeNull();
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      }),
    ).toBeNull();
  });
});
