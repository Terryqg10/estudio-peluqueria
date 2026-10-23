import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getPublicEnv } from '@/lib/env';
import { isDemoSessionExpired } from '@/lib/demo/session';
import { ROUTES } from '@/lib/routes';

// Renueva la sesión de la clienta (ADR-0021): refresca el token y reescribe las cookies. Solo corre
// en las rutas de la cuenta y del panel Admin; el resto de la web es pública y no toca Auth. No decide permisos: la
// RLS y las páginas comprueban la sesión por su cuenta.
export async function proxy(request: NextRequest) {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });
  if (!env) return response;

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();

  // La sesión de la cuenta demo caduca a la hora de entrar (ADR-0036, CA-51): se cierra y se vuelve a la home.
  const claims = (await supabase.auth.getClaims()).data?.claims;
  if (claims && isDemoSessionExpired(claims, Date.now())) {
    await supabase.auth.signOut({ scope: 'local' });
    const expired = NextResponse.redirect(new URL(ROUTES.home, request.url));
    for (const cookie of response.cookies.getAll()) expired.cookies.set(cookie);
    return expired;
  }
  return response;
}

export const config = {
  matcher: ['/mis-citas/:path*', '/acceso/:path*', '/admin/:path*'],
};
