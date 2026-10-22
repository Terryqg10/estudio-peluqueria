import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/lib/database.types';
import { TIME_ZONE, addDays, daysBetween, madridDateOf, todayInMadrid } from '@/lib/booking/dates';
import { parseRange } from '@/lib/booking/range';
import { LocalDateSchema, madridMidnightUtc } from './week';

// Bloqueos de franja y vacaciones del Admin (T-009b, RF-07, CA-19, CA-20; ADR-0028). Todo con el cliente de la
// sesión del Admin: `admin_create_time_blocks` vuelve a validar, exige `is_admin()` y rechaza con CONFLICT si hay
// citas activas dentro del rango.

export const MAX_BLOCK_DAYS_AHEAD = 366;
export const NOTE_MAX = 200;

const madridParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

// Diferencia entre la hora de Madrid y UTC en un instante, en milisegundos (+1 h o +2 h).
function madridOffsetMs(utcMs: number): number {
  const parts = Object.fromEntries(madridParts.formatToParts(new Date(utcMs)).map((p) => [p.type, Number(p.value)]));
  const asUtc = Date.UTC(parts.year ?? 1970, (parts.month ?? 1) - 1, parts.day ?? 1, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// Instante UTC de una fecha y hora locales de Madrid (HH:MM), con el cambio de hora resuelto.
export function madridDateTimeToUtc(date: string, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const [y, mo, d] = date.split('-').map(Number);
  const local = Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1, h ?? 0, m ?? 0);
  const first = local - madridOffsetMs(local);
  return new Date(local - madridOffsetMs(first));
}

export const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, 'Elige una hora de la lista');

export const BlockFormSchema = z
  .object({
    kind: z.enum(['vacation', 'block']),
    stylist: z.union([z.literal('all'), z.string().uuid()]),
    from: LocalDateSchema,
    to: LocalDateSchema.optional(),
    startTime: TimeSchema.optional(),
    endTime: TimeSchema.optional(),
    note: z.string().trim().max(NOTE_MAX, `La nota es demasiado larga (máximo ${NOTE_MAX})`),
  })
  .superRefine((value, ctx) => {
    const today = todayInMadrid();
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });

    if (daysBetween(today, value.from) < 0) issue('from', 'Elige un día que no haya pasado');
    if (daysBetween(today, value.from) > MAX_BLOCK_DAYS_AHEAD) issue('from', 'Elige una fecha dentro del próximo año');

    if (value.kind === 'vacation') {
      if (!value.to) return issue('to', 'Elige el último día de las vacaciones');
      if (daysBetween(value.from, value.to) < 0) issue('to', 'El último día no puede ser anterior al primero');
      if (daysBetween(today, value.to) > MAX_BLOCK_DAYS_AHEAD) issue('to', 'Elige una fecha dentro del próximo año');
    } else {
      if (!value.startTime) return issue('startTime', 'Elige la hora de inicio');
      if (!value.endTime) return issue('endTime', 'Elige la hora de fin');
      if (value.endTime <= value.startTime) issue('endTime', 'La hora de fin debe ser posterior a la de inicio');
    }
  });

export type BlockFormInput = z.input<typeof BlockFormSchema>;
export type BlockFormData = z.output<typeof BlockFormSchema>;

// Rango [inicio, fin) en UTC del bloqueo: días completos de Madrid (vacaciones) o franja de un día.
export function blockRange(data: BlockFormData): { start: Date; end: Date } {
  if (data.kind === 'vacation') {
    return {
      start: madridMidnightUtc(data.from),
      end: madridMidnightUtc(addDays(data.to ?? data.from, 1)),
    };
  }
  return {
    start: madridDateTimeToUtc(data.from, data.startTime ?? '00:00'),
    end: madridDateTimeToUtc(data.from, data.endTime ?? '00:00'),
  };
}

export type Conflict = {
  appointmentId: string;
  stylistName: string;
  clientName: string;
  date: string;
  startsAt: string;
  endsAt: string;
};

export type CreateBlockError = 'FORBIDDEN' | 'INVALID_INPUT' | 'CONFLICT' | 'UNAVAILABLE';

export type CreateBlockResult =
  | { ok: true; created: number }
  | {
      ok: false;
      error: CreateBlockError;
      fieldErrors?: Partial<Record<'from' | 'to' | 'startTime' | 'endTime' | 'note' | 'stylist', string>>;
      conflicts?: Conflict[];
    };

type FieldKey = 'from' | 'to' | 'startTime' | 'endTime' | 'note' | 'stylist';

export async function createTimeBlocks(client: SupabaseClient<Database>, input: unknown): Promise<CreateBlockResult> {
  const parsed = BlockFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<FieldKey, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as FieldKey | undefined;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: 'INVALID_INPUT', fieldErrors };
  }
  const data = parsed.data;

  try {
    const stylists = await client.from('stylists').select('id, name').eq('active', true);
    if (stylists.error) return { ok: false, error: 'UNAVAILABLE' };
    const ids =
      data.stylist === 'all' ? stylists.data.map((s) => s.id) : stylists.data.filter((s) => s.id === data.stylist).map((s) => s.id);
    if (ids.length === 0) return { ok: false, error: 'INVALID_INPUT', fieldErrors: { stylist: 'Elige una estilista de la lista' } };

    const { start, end } = blockRange(data);
    const { data: created, error } = await client.rpc('admin_create_time_blocks', {
      p_stylist_ids: ids,
      p_kind: data.kind,
      p_starts_at: start.toISOString(),
      p_ends_at: end.toISOString(),
      p_note: data.note === '' ? undefined : data.note,
    });
    if (!error) return { ok: true, created: created ?? ids.length };
    if (error.message === 'CONFLICT') {
      const conflicts = await findConflicts(client, ids, start, end);
      return { ok: false, error: 'CONFLICT', conflicts: conflicts ?? [] };
    }
    if (error.message === 'FORBIDDEN' || error.message === 'INVALID_INPUT') return { ok: false, error: error.message };
    return { ok: false, error: 'UNAVAILABLE' };
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}

// Citas confirmadas o pendientes que impiden el bloqueo, para que el Admin las mueva o cancele.
async function findConflicts(
  client: SupabaseClient<Database>,
  stylistIds: string[],
  start: Date,
  end: Date,
): Promise<Conflict[] | null> {
  const { data, error } = await client
    .from('appointments')
    .select('id, during, user_id, guest_name, stylists(name)')
    .in('stylist_id', stylistIds)
    .in('status', ['confirmed', 'pending'])
    .overlaps('during', `[${start.toISOString()},${end.toISOString()})`)
    .order('during', { ascending: true });
  if (error) return null;

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

export type TimeBlockRow = {
  id: string;
  stylistName: string;
  kind: 'vacation' | 'block' | 'break';
  note: string | null;
  startsAt: string;
  endsAt: string;
};

// Bloqueos que aún no han terminado, por orden de inicio.
export async function loadUpcomingBlocks(client: SupabaseClient<Database>): Promise<TimeBlockRow[] | 'error'> {
  const { data, error } = await client
    .from('time_blocks')
    .select('id, kind, note, during, stylists(name)')
    .overlaps('during', `[${new Date().toISOString()},infinity)`);
  if (error) return 'error';

  const rows: TimeBlockRow[] = [];
  for (const row of data) {
    const range = parseRange(row.during);
    if (!range) continue;
    rows.push({
      id: row.id,
      stylistName: row.stylists?.name ?? 'Estilista',
      kind: row.kind,
      note: row.note,
      startsAt: range.start,
      endsAt: range.end,
    });
  }
  return rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.stylistName.localeCompare(b.stylistName, 'es'));
}

export async function removeTimeBlock(client: SupabaseClient<Database>, id: unknown): Promise<boolean> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return false;
  try {
    const { error } = await client.from('time_blocks').delete().eq('id', parsed.data);
    return !error;
  } catch {
    return false;
  }
}
