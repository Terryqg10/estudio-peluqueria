import { z } from 'zod';

// Variables públicas de Supabase (URL y clave anon). La clave anon es pública por
// diseño: la RLS protege los datos. Nunca se usa aquí la clave de servicio.
const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type PublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv | null {
  const parsed = PublicEnvSchema.safeParse(source);
  if (!parsed.success) return null;
  return {
    supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

// Next sustituye estas referencias literales en la build; no se puede pasar process.env entero.
export function getPublicEnv(): PublicEnv | null {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
