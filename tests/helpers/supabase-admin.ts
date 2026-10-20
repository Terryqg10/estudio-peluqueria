import { spawnSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../../src/lib/database.types';

// Cliente de servicio SOLO para tests e2e: simula a «otra persona» que reserva un hueco.
// Las claves salen de `supabase status` (Supabase local), nunca del repositorio.
const EnvSchema = z.object({
  API_URL: z.string().url(),
  SERVICE_ROLE_KEY: z.string().min(1),
  MAILPIT_URL: z.string().url().default('http://127.0.0.1:54324'),
});

type StatusEnv = z.infer<typeof EnvSchema>;
let status: StatusEnv | null = null;

export function statusEnv(): StatusEnv {
  if (status) return status;
  const result = spawnSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Supabase local no está en marcha (`supabase start`).');
  status = EnvSchema.parse(JSON.parse(result.stdout));
  return status;
}

let cached: SupabaseClient<Database> | null = null;

export function adminClient(): SupabaseClient<Database> {
  if (cached) return cached;
  const env = statusEnv();
  cached = createClient<Database>(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export async function idByName(table: 'services' | 'stylists', name: string): Promise<string> {
  const { data, error } = await adminClient().from(table).select('id').eq('name', name).single();
  if (error) throw new Error(`${table} «${name}»: ${error.message}`);
  return data.id;
}

// Ocupa un hueco como lo haría otra sesión (T-005b aún no existe: se inserta con service_role).
export async function bookSlot(stylistId: string, serviceId: string, startsAtIso: string, minutes: number) {
  const start = new Date(startsAtIso);
  const end = new Date(start.getTime() + minutes * 60_000);
  const { data, error } = await adminClient()
    .from('appointments')
    .insert({
      stylist_id: stylistId,
      service_id: serviceId,
      during: `[${start.toISOString()},${end.toISOString()})`,
      status: 'confirmed',
      guest_name: 'Otra persona',
      guest_email: 'otra@test.invalid',
      guest_phone: '+34600000000',
    })
    .select('id')
    .single();
  if (error) throw new Error(`bookSlot: ${error.message}`);
  return data.id;
}

export async function deleteAppointment(id: string): Promise<void> {
  await adminClient().from('appointments').delete().eq('id', id);
}

// Citas de invitada creadas por un test (por su email único) y limpieza.
export async function appointmentsByEmail(email: string) {
  const { data, error } = await adminClient()
    .from('appointments')
    .select('id, status, user_id, guest_name, guest_email, guest_phone, consent_at, consent_version')
    .eq('guest_email', email);
  if (error) throw new Error(`appointmentsByEmail: ${error.message}`);
  return data;
}

export async function deleteAppointmentsByEmail(email: string): Promise<void> {
  await adminClient().from('appointments').delete().eq('guest_email', email);
}

// Citas activas de una estilista que solapan un instante: para comprobar que NO se creó ninguna.
export async function activeAppointmentsAt(stylistId: string, startsAtIso: string, minutes: number) {
  const start = new Date(startsAtIso);
  const end = new Date(start.getTime() + minutes * 60_000);
  const { data, error } = await adminClient()
    .from('appointments')
    .select('id')
    .eq('stylist_id', stylistId)
    .neq('status', 'cancelled')
    .overlaps('during', `[${start.toISOString()},${end.toISOString()})`);
  if (error) throw new Error(`activeAppointmentsAt: ${error.message}`);
  return data;
}

// Cita de invitada creada a mano con service_role y su token de gestión (T-006a). Se coloca de
// madrugada, 30 días adelante y con un desplazamiento aleatorio, para no pisar a otros tests.
// `past: true` la pone en el pasado: su token nace ya caducado (expira al inicio de la cita).
export async function createAppointmentWithToken(options: { past?: boolean; soon?: boolean } = {}) {
  const client = adminClient();
  const stylistId = await idByName('stylists', 'Irene Solís');
  const serviceId = await idByName('services', 'Tratamiento hidratante');

  // Los tests corren en paralelo y comparten estilista: si el hueco aleatorio choca con otro
  // (restricción anti-solape, código 23P01) se prueba con otro. Cualquier otro error se propaga.
  for (let attempt = 0; attempt < 10; attempt++) {
    const offsetMinutes = Math.floor(Math.random() * 190) * 15;
    const start = new Date();
    if (options.soon) {
      // Dentro de las próximas 24 h (entre 2 y 7 h): fuera de la ventana de cancelación.
      start.setTime(start.getTime() + (2 * 60 + Math.floor(Math.random() * 300)) * 60_000);
      start.setUTCSeconds(0, 0);
    } else {
      start.setUTCDate(start.getUTCDate() + (options.past ? -10 : 30));
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCMinutes(offsetMinutes);
    }
    const end = new Date(start.getTime() + 30 * 60_000);

    const { data, error } = await client
      .from('appointments')
      .insert({
        stylist_id: stylistId,
        service_id: serviceId,
        during: `[${start.toISOString()},${end.toISOString()})`,
        status: 'confirmed',
        guest_name: 'Persona de prueba',
        guest_email: `token-${Date.now()}-${offsetMinutes}@test.invalid`,
        guest_phone: '+34600000000',
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23P01') continue;
      throw new Error(`createAppointmentWithToken: ${error.message}`);
    }
    const token = await issueToken(data.id);
    return { id: data.id, token, stylistId, startsAt: start.toISOString() };
  }
  throw new Error('createAppointmentWithToken: no se encontró un hueco libre en 10 intentos');
}

// Mueve una cita a dentro de 8-20 h (menos de 24 h), reintentando si el hueco choca con otra.
export async function moveAppointmentSoon(id: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const start = new Date(Date.now() + (8 * 60 + Math.floor(Math.random() * 720)) * 60_000);
    start.setUTCSeconds(0, 0);
    const end = new Date(start.getTime() + 30 * 60_000);
    const { error } = await adminClient()
      .from('appointments')
      .update({ during: `[${start.toISOString()},${end.toISOString()})` })
      .eq('id', id);
    if (!error) return;
    if (error.code !== '23P01') throw new Error(`moveAppointmentSoon: ${error.message}`);
  }
  throw new Error('moveAppointmentSoon: no se encontró un hueco libre en 10 intentos');
}

// Emite (o re-emite: invalida el anterior) el token de gestión de una cita.
export async function issueToken(appointmentId: string): Promise<string> {
  const { data, error } = await adminClient().rpc('issue_management_token', {
    p_appointment_id: appointmentId,
  });
  if (error || !data) throw new Error(`issueToken: ${error?.message ?? 'sin token'}`);
  return data;
}

export async function emailSentAt(appointmentId: string): Promise<string | null> {
  const { data, error } = await adminClient()
    .from('appointments')
    .select('confirmation_email_sent_at')
    .eq('id', appointmentId)
    .single();
  if (error) throw new Error(`emailSentAt: ${error.message}`);
  return data.confirmation_email_sent_at;
}
