import { parseRange } from '@/lib/booking/range';
import type { STATUS_LABELS } from '@/lib/booking/status';
import { createAuthClient } from '@/lib/supabase/auth-server';

export type MyAppointment = {
  id: string;
  serviceName: string;
  stylistName: string;
  startsAt: string;
  endsAt: string;
  status: keyof typeof STATUS_LABELS;
  upcoming: boolean;
};

export type MyAppointmentsResult =
  | { state: 'anonymous' }
  | { state: 'error' }
  | { state: 'ok'; email: string | null; upcoming: MyAppointment[]; past: MyAppointment[] };

// Citas de la clienta con sesión. Se lee con SU cliente (clave anónima + cookie), no con la clave de
// servicio: es la RLS (`own_select_appointments`) la que limita las filas a las suyas (CA-12).
export async function loadMyAppointments(now: Date = new Date()): Promise<MyAppointmentsResult> {
  const client = await createAuthClient();
  if (!client) return { state: 'error' };

  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return { state: 'anonymous' };

  const { data, error } = await client
    .from('appointments')
    .select('id, status, during, services(name), stylists(name)')
    .order('during', { ascending: true });
  if (error) return { state: 'error' };

  const items: MyAppointment[] = [];
  for (const row of data) {
    const range = parseRange(row.during);
    if (!range) continue;
    items.push({
      id: row.id,
      serviceName: row.services?.name ?? 'Servicio',
      stylistName: row.stylists?.name ?? 'Estilista',
      startsAt: range.start,
      endsAt: range.end,
      status: row.status,
      upcoming:
        new Date(range.end).getTime() > now.getTime() &&
        (row.status === 'confirmed' || row.status === 'pending'),
    });
  }
  return {
    state: 'ok',
    email: userData.user.email ?? null,
    upcoming: items.filter((a) => a.upcoming),
    past: items.filter((a) => !a.upcoming).reverse(),
  };
}
