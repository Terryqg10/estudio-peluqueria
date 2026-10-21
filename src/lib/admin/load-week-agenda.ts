import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { madridDateOf } from '@/lib/booking/dates';
import { parseRange } from '@/lib/booking/range';
import type { STATUS_LABELS } from '@/lib/booking/status';
import { weekRange } from './week';

export type AgendaStylist = { id: string; name: string };

export type AgendaAppointment = {
  id: string;
  stylistId: string;
  date: string; // día local (Europe/Madrid) en que empieza
  startsAt: string;
  endsAt: string;
  status: keyof typeof STATUS_LABELS;
  serviceName: string;
  clientName: string;
  phone: string | null;
  email: string | null;
  isGuest: boolean;
};

export type WeekAgendaResult =
  | { state: 'error' }
  | { state: 'ok'; stylists: AgendaStylist[]; appointments: AgendaAppointment[] };

export const ACCOUNT_CLIENT_LABEL = 'Clienta con cuenta';

// Agenda de la semana, leída con el cliente de la sesión del Admin: la RLS (`admin_select_*`) decide qué
// filas ve. Nunca `service_role` (ADR-0022). Cualquier error de lectura es un error de toda la agenda:
// no se muestra una semana a medias como si fuera la real.
export async function loadWeekAgenda(
  client: SupabaseClient<Database>,
  monday: string,
): Promise<WeekAgendaResult> {
  const { start, end } = weekRange(monday);

  const [appointmentsRes, stylistsRes] = await Promise.all([
    client
      .from('appointments')
      .select(
        'id, stylist_id, status, during, user_id, guest_name, guest_email, guest_phone, services(name)',
      )
      .overlaps('during', `[${start},${end})`)
      .order('during', { ascending: true }),
    client.from('stylists').select('id, name, active').order('name', { ascending: true }),
  ]);
  if (appointmentsRes.error || stylistsRes.error) return { state: 'error' };

  const userIds = [...new Set(appointmentsRes.data.flatMap((a) => (a.user_id ? [a.user_id] : [])))];
  const profiles = new Map<string, { full_name: string | null; phone: string | null }>();
  if (userIds.length > 0) {
    const profilesRes = await client.from('profiles').select('id, full_name, phone').in('id', userIds);
    if (profilesRes.error) return { state: 'error' };
    for (const p of profilesRes.data) profiles.set(p.id, p);
  }

  const appointments: AgendaAppointment[] = [];
  for (const row of appointmentsRes.data) {
    const range = parseRange(row.during);
    if (!range) continue;
    const profile = row.user_id ? profiles.get(row.user_id) : undefined;
    appointments.push({
      id: row.id,
      stylistId: row.stylist_id,
      date: madridDateOf(range.start),
      startsAt: range.start,
      endsAt: range.end,
      status: row.status,
      serviceName: row.services?.name ?? 'Servicio',
      clientName: row.guest_name ?? profile?.full_name ?? ACCOUNT_CLIENT_LABEL,
      phone: row.guest_phone ?? profile?.phone ?? null,
      email: row.guest_email ?? null,
      isGuest: !row.user_id,
    });
  }

  // Una estilista dada de baja solo aparece si tiene citas esa semana.
  const withAppointments = new Set(appointments.map((a) => a.stylistId));
  const stylists = stylistsRes.data
    .filter((s) => s.active || withAppointments.has(s.id))
    .map((s) => ({ id: s.id, name: s.name }));

  return { state: 'ok', stylists, appointments };
}
