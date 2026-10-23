import { isAdminSession } from '@/lib/account/require-admin';
import { createAuthClient } from '@/lib/supabase/auth-server';

// Cuenta con la que se reserva (T-021, RF-04, ADR-0034). La identidad sale SIEMPRE de la sesión
// (cookie de servidor), nunca de la entrada del formulario.
export type BookingAccount = {
  userId: string;
  email: string;
  name: string | null; // del perfil, para precargar el formulario
  phone: string | null;
};

// Cuenta de clienta con sesión, o null si no hay sesión, la sesión es de Admin (el Admin reserva como
// invitada: no mezcla su cuenta de gestión con citas de clienta) o algo falla (falla abierto a invitada:
// nunca bloquea la reserva).
export async function getBookingAccount(): Promise<BookingAccount | null> {
  try {
    const client = await createAuthClient();
    if (!client) return null;
    const { data } = await client.auth.getUser();
    const user = data.user;
    if (!user?.email) return null;
    if (await isAdminSession(client)) return null;

    // Con su propio cliente: la RLS (`own_select_profiles`) limita la lectura a su fila.
    const profile = await client.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle();
    return {
      userId: user.id,
      email: user.email.trim().toLowerCase(),
      name: profile.data?.full_name ?? null,
      phone: profile.data?.phone ?? null,
    };
  } catch {
    return null;
  }
}
