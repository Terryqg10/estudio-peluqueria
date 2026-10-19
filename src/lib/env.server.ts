import { z } from 'zod';

// Entorno SOLO de servidor (ADR-0015). Está en un módulo aparte de `env.ts` para que ni siquiera
// el NOMBRE de la clave de servicio entre en el bundle del navegador: `env.ts` lo importan
// componentes de cliente. La clave NUNCA lleva prefijo NEXT_PUBLIC_.
const ServerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type ServerEnv = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv | null {
  const parsed = ServerEnvSchema.safeParse(source);
  if (!parsed.success) return null;
  return {
    supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function getServerEnv(): ServerEnv | null {
  return parseServerEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
