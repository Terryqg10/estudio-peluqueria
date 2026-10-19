import { spawnSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../../src/lib/database.types';

// Cliente de servicio SOLO para tests e2e: simula a «otra persona» que reserva un hueco.
// Las claves salen de `supabase status` (Supabase local), nunca del repositorio.
const EnvSchema = z.object({ API_URL: z.string().url(), SERVICE_ROLE_KEY: z.string().min(1) });

let cached: SupabaseClient<Database> | null = null;

export function adminClient(): SupabaseClient<Database> {
  if (cached) return cached;
  const result = spawnSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Supabase local no está en marcha (`supabase start`).');
  const env = EnvSchema.parse(JSON.parse(result.stdout));
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
