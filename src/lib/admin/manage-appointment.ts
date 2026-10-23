import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/lib/database.types';
import { madridDateOf } from '@/lib/booking/dates';
import { parseRange } from '@/lib/booking/range';
import type { STATUS_LABELS } from '@/lib/booking/status';
import { LocalDateSchema } from './week';

// Mover y cancelar citas desde el panel (T-008c, ADR-0026). Todo con el cliente de la sesión del Admin:
// las funciones de BD vuelven a comprobar `is_admin()` y deciden horario, solapes y carreras.

export const AppointmentIdSchema = z.string().uuid();

export const MoveInputSchema = z.object({
  appointmentId: AppointmentIdSchema,
  // «<estilista>|<inicio ISO>»: lo que envía el radio del formulario.
  slot: z
    .string()
    .max(100)
    .transform((value) => value.split('|'))
    .pipe(z.tuple([z.string().uuid(), z.string().datetime({ offset: true })])),
});

// Nota interna para la estilista (ADR-0027): texto libre, hasta 500 caracteres; vacía = sin nota.
export const NOTE_MAX_LENGTH = 500;
export const NoteSchema = z.string().trim().max(NOTE_MAX_LENGTH);

export type AdminAppointment = {
  id: string;
  stylistId: string;
  note: string;
  stylistName: string;
  serviceName: string;
  date: string;
  startsAt: string;
  endsAt: string;
  status: keyof typeof STATUS_LABELS;
  clientName: string;
  phone: string | null;
  email: string | null;
};

export type SlotOption = { stylistId: string; stylistName: string; startsAt: string };

export type ManageError =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'INVALID_INPUT'
  | 'NO_CHANGE'
  | 'SLOT_TAKEN'
  | 'UNAVAILABLE';

export type ManageResult = { ok: true; date: string } | { ok: false; error: ManageError };

const KNOWN: Record<string, ManageError> = {
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_STATE: 'INVALID_STATE',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_SELECTION: 'INVALID_INPUT',
  NO_CHANGE: 'NO_CHANGE',
  SLOT_TAKEN: 'SLOT_TAKEN',
};

export async function loadAdminAppointment(
  client: SupabaseClient<Database>,
  id: unknown,
): Promise<AdminAppointment | null | 'error'> {
  const parsed = AppointmentIdSchema.safeParse(id);
  if (!parsed.success) return null;

  const { data, error } = await client
    .from('appointments')
    .select(
      'id, stylist_id, status, during, user_id, anonymized_at, guest_name, guest_email, guest_phone, services(name), stylists(name)',
    )
    .eq('id', parsed.data)
    .maybeSingle();
  if (error) return 'error';
  if (!data) return null;
  const range = parseRange(data.during);
  if (!range) return 'error';

  let profileName: string | null = null;
  let profilePhone: string | null = null;
  if (data.user_id) {
    const profile = await client.from('profiles').select('full_name, phone').eq('id', data.user_id).maybeSingle();
    if (profile.error) return 'error';
    profileName = profile.data?.full_name ?? null;
    profilePhone = profile.data?.phone ?? null;
  }

  const noteRes = await client
    .from('appointment_notes')
    .select('note')
    .eq('appointment_id', data.id)
    .maybeSingle();
  if (noteRes.error) return 'error';

  return {
    id: data.id,
    stylistId: data.stylist_id,
    note: noteRes.data?.note ?? '',
    stylistName: data.stylists?.name ?? 'Estilista',
    serviceName: data.services?.name ?? 'Servicio',
    date: madridDateOf(range.start),
    startsAt: range.start,
    endsAt: range.end,
    status: data.status,
    clientName: data.anonymized_at ? 'Clienta anonimizada' : (data.guest_name ?? profileName ?? 'Clienta con cuenta'),
    phone: data.guest_phone ?? profilePhone,
    email: data.guest_email,
  };
}

// Huecos para mover la cita en un día (sin contar la propia cita), con el nombre de cada estilista.
export async function loadMoveSlots(
  client: SupabaseClient<Database>,
  id: string,
  date: unknown,
): Promise<SlotOption[] | 'error'> {
  const day = LocalDateSchema.safeParse(date);
  if (!day.success) return [];

  const [slots, stylists] = await Promise.all([
    client.rpc('admin_appointment_availability', { p_appointment_id: id, p_date: day.data }),
    client.from('stylists').select('id, name'),
  ]);
  if (slots.error || stylists.error) return 'error';

  const names = new Map(stylists.data.map((s) => [s.id, s.name]));
  return slots.data
    .map((s) => ({ stylistId: s.stylist_id, stylistName: names.get(s.stylist_id) ?? 'Estilista', startsAt: s.starts_at }))
    .sort((a, b) => a.stylistName.localeCompare(b.stylistName, 'es') || a.startsAt.localeCompare(b.startsAt));
}

export type StylistOption = { id: string; name: string };

// Estilistas activas que hacen el servicio de la cita (las que se pueden elegir al mover).
export async function loadStylistOptions(
  client: SupabaseClient<Database>,
  appointmentId: string,
): Promise<StylistOption[] | 'error'> {
  const appt = await client.from('appointments').select('service_id').eq('id', appointmentId).maybeSingle();
  if (appt.error) return 'error';
  if (!appt.data) return [];

  const offered = await client
    .from('stylist_services')
    .select('stylist_id')
    .eq('service_id', appt.data.service_id);
  const stylists = await client.from('stylists').select('id, name').eq('active', true).order('name');
  if (offered.error || stylists.error) return 'error';

  const ids = new Set(offered.data.map((o) => o.stylist_id));
  return stylists.data.filter((s) => ids.has(s.id));
}

// Guarda o borra la nota de la cita. Una nota vacía borra la fila.
export async function saveNote(
  client: SupabaseClient<Database>,
  appointmentId: string,
  rawNote: unknown,
): Promise<{ ok: true } | { ok: false; error: ManageError }> {
  const id = AppointmentIdSchema.safeParse(appointmentId);
  const note = NoteSchema.safeParse(rawNote);
  if (!id.success || !note.success) return { ok: false, error: 'INVALID_INPUT' };

  try {
    const result =
      note.data === ''
        ? await client.from('appointment_notes').delete().eq('appointment_id', id.data)
        : await client
            .from('appointment_notes')
            .upsert(
              { appointment_id: id.data, note: note.data, updated_at: new Date().toISOString() },
              { onConflict: 'appointment_id' },
            );
    return result.error ? { ok: false, error: 'UNAVAILABLE' } : { ok: true };
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}

export async function moveAppointment(
  client: SupabaseClient<Database>,
  input: unknown,
): Promise<ManageResult> {
  const parsed = MoveInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const [stylistId, startsAt] = parsed.data.slot;

  try {
    const { data, error } = await client.rpc('admin_reschedule_appointment', {
      p_appointment_id: parsed.data.appointmentId,
      p_stylist_id: stylistId,
      p_starts_at: startsAt,
    });
    if (error) return { ok: false, error: KNOWN[error.message] ?? 'UNAVAILABLE' };
    const row = data?.[0];
    return row ? { ok: true, date: madridDateOf(row.starts_at) } : { ok: false, error: 'UNAVAILABLE' };
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}

export async function cancelAppointmentAsAdmin(
  client: SupabaseClient<Database>,
  appointmentId: unknown,
  date: string,
): Promise<ManageResult> {
  const parsed = AppointmentIdSchema.safeParse(appointmentId);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  try {
    const { data, error } = await client.rpc('admin_cancel_appointment', { p_appointment_id: parsed.data });
    if (error) return { ok: false, error: KNOWN[error.message] ?? 'UNAVAILABLE' };
    return data?.[0] ? { ok: true, date } : { ok: false, error: 'UNAVAILABLE' };
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}
