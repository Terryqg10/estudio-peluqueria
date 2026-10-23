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
  | ({ state: 'admin' } & AdminContext)
  | ({ state: 'demo' } & AdminContext); // cuenta demo de solo lectura (ADR-0036)

// Acceso al panel para LEER: el Admin y la cuenta demo. `readOnly` solo informa a la interfaz; la barrera real es la BD.
export type PanelAccess = AdminContext & { readOnly: boolean };

// ¿La sesión de este cliente es de un Admin? Usa la misma función que la RLS (`is_admin()`), así que
// la app y la BD no pueden discrepar. Cualquier error cuenta como «no» (falla cerrado).
export async function isAdminSession(client: SupabaseClient<Database>): Promise<boolean> {
  const { data, error } = await client.rpc('is_admin');
  return !error && data === true;
}

// ¿Es la sesión de la cuenta demo? Misma idea que `isAdminSession` (`is_demo()` de la BD), falla cerrado.
export async function isDemoSession(client: SupabaseClient<Database>): Promise<boolean> {
  const { data, error } = await client.rpc('is_demo');
  return !error && data === true;
}

// El rol se lee de la BD en CADA petición: no va en la cookie, así que revocarlo surte efecto ya.
export async function getAdminState(): Promise<AdminState> {
  const client = await createAuthClient();
  if (!client) return { state: 'forbidden' };

  const { data } = await client.auth.getUser(); // valida el token contra Auth, no solo la cookie
  if (!data.user) return { state: 'anonymous' };

  const context = { client, userId: data.user.id, email: data.user.email ?? null };
  if (await isAdminSession(client)) return { state: 'admin', ...context };
  if (await isDemoSession(client)) return { state: 'demo', ...context };
  return { state: 'forbidden' };
}

// Guardián del panel (ADR-0022). Cada página y cada acción de servidor de `/admin` lo llama: un layout
// no basta, porque no se vuelve a ejecutar al navegar entre páginas hijas.
//   sin sesión → /acceso · con sesión sin rol admin → 404, como una ruta que no existe.
export async function requireAdmin(): Promise<AdminContext> {
  const result = await getAdminState();
  if (result.state === 'anonymous') redirect(ROUTES.acceso);
  if (result.state === 'forbidden') notFound();
  // La cuenta demo no escribe (ADR-0036): cualquier acción de escritura que llegue hasta aquí vuelve al panel con un
  // aviso de solo lectura, no con un 404. Aunque pasara, la BD rechaza la escritura.
  if (result.state === 'demo') redirect(`${ROUTES.admin}?aviso=solo-lectura`);
  return result;
}

// Guardián de las páginas de LECTURA del panel: admite al Admin y a la cuenta demo (T-028). Las acciones de
// escritura siguen con `requireAdmin()`.
export async function requirePanel(): Promise<PanelAccess> {
  const result = await getAdminState();
  if (result.state === 'anonymous') redirect(ROUTES.acceso);
  if (result.state === 'forbidden') notFound();
  return { client: result.client, userId: result.userId, email: result.email, readOnly: result.state === 'demo' };
}
