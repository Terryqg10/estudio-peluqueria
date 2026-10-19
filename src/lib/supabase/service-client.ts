import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getServerEnv } from '@/lib/env.server';

// Cliente con la clave de servicio (ADR-0015). SOLO servidor: se usa desde acciones y páginas de
// servidor, nunca desde componentes de cliente. Salta la RLS, así que cada uso debe estar justificado.
export function createServiceClient(): SupabaseClient<Database> | null {
  if (typeof window !== 'undefined') {
    throw new Error('El cliente de servicio no puede usarse en el navegador.');
  }
  const env = getServerEnv();
  if (!env) return null;
  return createClient<Database>(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
