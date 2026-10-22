import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database, Json } from '@/lib/database.types';
import { madridDateOf } from '@/lib/booking/dates';
import { parseRange } from '@/lib/booking/range';
import type { Conflict } from './time-blocks';

// Horarios semanales del salón y de las estilistas (T-009c, RF-07, CA-38, CA-39; ADR-0029). Todo con el cliente
// de la sesión del Admin: `admin_save_weekly_hours` vuelve a validar, exige `is_admin()` y rechaza con CONFLICT
// si el horario deja citas futuras fuera.

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

// Horas de 15 en 15 minutos, de 07:00 a 22:00.
export const TIME_OPTIONS = Array.from({ length: 61 }, (_, i) => {
  const minutes = 7 * 60 + i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, 'Elige una hora de la lista');

const RangeSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  starts: TimeSchema,
  ends: TimeSchema,
});

export const ScheduleSchema = z
  .array(RangeSchema)
  .max(70, 'Hay demasiados tramos')
  .superRefine((ranges, ctx) => {
    for (const r of ranges) {
      if (r.starts >= r.ends) {
        ctx.addIssue({ code: 'custom', message: `${WEEKDAYS[r.weekday - 1]}: la hora de fin debe ser posterior a la de inicio` });
      }
    }
    for (let weekday = 1; weekday <= 7; weekday++) {
      const day = ranges.filter((r) => r.weekday === weekday).sort((a, b) => a.starts.localeCompare(b.starts));
      for (let i = 1; i < day.length; i++) {
        const previous = day[i - 1];
        const current = day[i];
        if (previous && current && current.starts < previous.ends) {
          ctx.addIssue({ code: 'custom', message: `${WEEKDAYS[weekday - 1]}: los tramos no pueden solaparse` });
        }
      }
    }
  });

export type ScheduleRange = z.infer<typeof RangeSchema>;

export const ScopeSchema = z.union([z.literal('salon'), z.string().uuid()]);

export type SaveScheduleError = 'FORBIDDEN' | 'INVALID_INPUT' | 'CONFLICT' | 'UNAVAILABLE';

export type SaveScheduleResult =
  | { ok: true }
  | { ok: false; error: SaveScheduleError; message?: string; conflicts?: Conflict[] };

// Quita los segundos de una hora de la BD («10:00:00» → «10:00»).
function hhmm(time: string): string {
  return time.slice(0, 5);
}

export type ScheduleScopes = {
  stylists: { id: string; name: string }[];
};

export async function loadStylistsForSchedules(client: SupabaseClient<Database>): Promise<ScheduleScopes | 'error'> {
  const { data, error } = await client.from('stylists').select('id, name').eq('active', true).order('name', { ascending: true });
  return error ? 'error' : { stylists: data };
}

export async function loadSchedule(
  client: SupabaseClient<Database>,
  scope: string,
): Promise<ScheduleRange[] | 'error'> {
  if (scope === 'salon') {
    const { data, error } = await client.from('salon_hours').select('weekday, opens, closes').order('weekday').order('opens');
    if (error) return 'error';
    return data.map((r) => ({ weekday: r.weekday, starts: hhmm(r.opens), ends: hhmm(r.closes) }));
  }
  const { data, error } = await client
    .from('stylist_schedule')
    .select('weekday, starts, ends')
    .eq('stylist_id', scope)
    .order('weekday')
    .order('starts');
  if (error) return 'error';
  return data.map((r) => ({ weekday: r.weekday, starts: hhmm(r.starts), ends: hhmm(r.ends) }));
}

export async function saveSchedule(
  client: SupabaseClient<Database>,
  scopeInput: unknown,
  rangesInput: unknown,
): Promise<SaveScheduleResult> {
  const scope = ScopeSchema.safeParse(scopeInput);
  const ranges = ScheduleSchema.safeParse(rangesInput);
  if (!scope.success) return { ok: false, error: 'INVALID_INPUT' };
  if (!ranges.success) return { ok: false, error: 'INVALID_INPUT', message: ranges.error.issues[0]?.message };

  const stylistId = scope.data === 'salon' ? undefined : scope.data;
  const payload: Json = ranges.data.map((r) => ({ weekday: r.weekday, starts: r.starts, ends: r.ends }));

  try {
    const { error } = await client.rpc('admin_save_weekly_hours', { p_ranges: payload, p_stylist_id: stylistId });
    if (!error) return { ok: true };
    if (error.message === 'CONFLICT') {
      return { ok: false, error: 'CONFLICT', conflicts: await findConflicts(client, payload, stylistId) };
    }
    if (error.message === 'FORBIDDEN' || error.message === 'INVALID_INPUT') return { ok: false, error: error.message };
    return { ok: false, error: 'UNAVAILABLE' };
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}

// Citas futuras que quedarían fuera del horario propuesto, con el nombre de la clienta y de la estilista.
async function findConflicts(
  client: SupabaseClient<Database>,
  ranges: Json,
  stylistId: string | undefined,
): Promise<Conflict[]> {
  const listed = await client.rpc('admin_schedule_conflicts', { p_ranges: ranges, p_stylist_id: stylistId });
  if (listed.error || listed.data.length === 0) return [];

  const ids = listed.data.map((c) => c.appointment_id);
  const { data, error } = await client
    .from('appointments')
    .select('id, during, guest_name, stylists(name)')
    .in('id', ids)
    .order('during', { ascending: true });
  if (error) return [];

  const conflicts: Conflict[] = [];
  for (const row of data) {
    const range = parseRange(row.during);
    if (!range) continue;
    conflicts.push({
      appointmentId: row.id,
      stylistName: row.stylists?.name ?? 'Estilista',
      clientName: row.guest_name ?? 'Clienta con cuenta',
      date: madridDateOf(range.start),
      startsAt: range.start,
      endsAt: range.end,
    });
  }
  return conflicts;
}
