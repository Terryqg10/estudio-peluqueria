import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getPublicEnv } from '@/lib/env';

// Cliente anónimo para lectura pública desde servidor. La RLS (T-002) limita lo que ve.
export function createPublicClient(): SupabaseClient<Database> | null {
  const env = getPublicEnv();
  if (!env) return null;
  return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
