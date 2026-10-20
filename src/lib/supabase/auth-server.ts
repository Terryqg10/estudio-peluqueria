import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';
import { getPublicEnv } from '@/lib/env';

// Cliente con la sesión de la clienta (cookie de servidor, ADR-0021). Usa la clave anónima: lo que
// ve lo decide la RLS según `auth.uid()`, nunca la clave de servicio. SOLO servidor.
// Desde un Server Component no se pueden escribir cookies; la renovación de la sesión la hace
// `proxy.ts`, así que ahí el fallo de `set` se ignora a propósito.
export async function createAuthClient(): Promise<SupabaseClient<Database> | null> {
  const env = getPublicEnv();
  if (!env) return null;
  const store = await cookies();
  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Component: la sesión la renueva proxy.ts.
        }
      },
    },
  });
}
