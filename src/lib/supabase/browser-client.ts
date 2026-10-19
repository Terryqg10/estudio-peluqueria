import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getPublicEnv } from '@/lib/env';

let client: SupabaseClient<Database> | null = null;

// Cliente anónimo del navegador. Solo se usa para escuchar el canal público `availability`
// (ADR-0013); los datos se leen por las acciones de servidor, no desde aquí.
export function getBrowserClient(): SupabaseClient<Database> | null {
  if (client) return client;
  const env = getPublicEnv();
  if (!env) return null;
  client = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
