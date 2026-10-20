import type { SupabaseClient } from '@supabase/supabase-js';
import { notFound, redirect } from 'next/navigation';
import type { Database } from '@/lib/database.types';
import { ROUTES } from '@/lib/routes';
import { createAuthClient } from '@/lib/supabase/auth-server';

export type AdminContext = {
  // Cliente con la sesión del Admin (clave anónima + cookie). Es la RLS la que protege los datos:
  // el panel NUNCA usa la clave de servicio (ADR-0022).
  client: SupabaseClient<Database>;
  userId: string;
  email: string | null;
};

export type AdminState =
  | { state: 'anonymous' }
  | { state: 'forbidden' }
  | ({ state: 'admin' } & AdminContext);

// ¿La sesión de este cliente es de un Admin? Usa la misma función que la RLS (`is_admin()`), así que
// la app y la BD no pueden discrepar. Cualquier error cuenta como «no» (falla cerrado).
export async function isAdminSession(client: SupabaseClient<Database>): Promise<boolean> {
  const { data, error } = await client.rpc('is_admin');
  return !error && data === true;
}

// El rol se lee de la BD en CADA petición: no va en la cookie, así que revocarlo surte efecto ya.
export async function getAdminState(): Promise<AdminState> {
  const client = await createAuthClient();
  if (!client) return { state: 'forbidden' };

  const { data } = await client.auth.getUser(); // valida el token contra Auth, no solo la cookie
  if (!data.user) return { state: 'anonymous' };

  if (!(await isAdminSession(client))) return { state: 'forbidden' };
  return { state: 'admin', client, userId: data.user.id, email: data.user.email ?? null };
}

// Guardián del panel (ADR-0022). Cada página y cada acción de servidor de `/admin` lo llama: un layout
// no basta, porque no se vuelve a ejecutar al navegar entre páginas hijas.
//   sin sesión → /acceso · con sesión sin rol admin → 404, como una ruta que no existe.
export async function requireAdmin(): Promise<AdminContext> {
  const result = await getAdminState();
  if (result.state === 'anonymous') redirect(ROUTES.acceso);
  if (result.state === 'forbidden') notFound();
  return result;
}
