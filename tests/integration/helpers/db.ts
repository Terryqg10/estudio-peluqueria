import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/lib/database.types';

export type Db = SupabaseClient<Database>;
type AppointmentInsert = Database['public']['Tables']['appointments']['Insert'];

const EnvSchema = z.object({
  API_URL: z.string().url(),
  ANON_KEY: z.string().min(1),
  SERVICE_ROLE_KEY: z.string().min(1),
});

// En local se leen de `supabase status`; en CI pueden venir de variables de entorno.
function readEnv() {
  const fromEnv = {
    API_URL: process.env.SUPABASE_URL,
    ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const direct = EnvSchema.safeParse(fromEnv);
  if (direct.success) return direct.data;

  const result = spawnSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      'No se pudo obtener la configuración de Supabase local. ¿Está corriendo `supabase start`?',
    );
  }
  return EnvSchema.parse(JSON.parse(result.stdout));
}

const env = readEnv();

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export function anonClient(): Db {
  return createClient<Database>(env.API_URL, env.ANON_KEY, clientOptions);
}

export const service: Db = createClient<Database>(env.API_URL, env.SERVICE_ROLE_KEY, clientOptions);

export type TestUser = { id: string; email: string; client: Db };

const createdUsers: string[] = [];
const createdStylists: string[] = [];
const createdServices: string[] = [];
const createdBlocks: string[] = [];
const createdAppointments: string[] = [];

export async function createUser(prefix: string): Promise<TestUser> {
  const email = `${prefix}-${randomUUID()}@test.invalid`;
  const password = randomUUID();
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message ?? 'sin usuario'}`);
  createdUsers.push(data.user.id);

  const client = anonClient();
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw new Error(`signIn: ${signed.error.message}`);
  return { id: data.user.id, email, client };
}

export async function createAdmin(): Promise<TestUser> {
  const user = await createUser('admin');
  const { error } = await service.from('profiles').update({ role: 'admin' }).eq('id', user.id);
  if (error) throw new Error(`createAdmin: ${error.message}`);
  return user;
}

// Cuenta de solo lectura del panel (ADR-0036, T-026).
export async function createDemo(): Promise<TestUser> {
  const user = await createUser('demo');
  const { error } = await service.from('profiles').update({ role: 'demo' }).eq('id', user.id);
  if (error) throw new Error(`createDemo: ${error.message}`);
  return user;
}

export async function createStylist(name = 'Estilista de prueba'): Promise<string> {
  const { data, error } = await service.from('stylists').insert({ name }).select('id').single();
  if (error) throw new Error(`createStylist: ${error.message}`);
  createdStylists.push(data.id);
  return data.id;
}

export async function createService(durationMin = 60): Promise<string> {
  const { data, error } = await service
    .from('services')
    .insert({
      category: 'Prueba',
      name: `Servicio de prueba ${randomUUID()}`,
      price_from_cents: 1000,
      duration_min: durationMin,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createService: ${error.message}`);
  createdServices.push(data.id);
  return data.id;
}

export function range(start: Date, minutes: number): string {
  const end = new Date(start.getTime() + minutes * 60_000);
  return `[${start.toISOString()},${end.toISOString()})`;
}

export function daysFromNow(days: number, hour = 10): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

type NewAppointment = {
  stylistId: string;
  serviceId: string;
  start: Date;
  minutes?: number;
  status?: Database['public']['Enums']['appointment_status'];
  userId?: string;
  guestEmail?: string;
  guestName?: string;
  guestPhone?: string;
  isSample?: boolean;
};

// Inserta con service_role (la reserva real llegará en T-005). Devuelve el error
// en lugar de lanzarlo para poder comprobar los rechazos de la BD.
export async function insertAppointment(a: NewAppointment) {
  const owner: Pick<AppointmentInsert, 'user_id' | 'guest_name' | 'guest_email' | 'guest_phone'> =
    a.userId
      ? { user_id: a.userId }
      : {
          guest_name: a.guestName ?? 'Invitada de prueba',
          guest_email: a.guestEmail ?? 'invitada@test.invalid',
          guest_phone: a.guestPhone ?? '+34600000000',
        };
  const row: AppointmentInsert = {
    stylist_id: a.stylistId,
    service_id: a.serviceId,
    during: range(a.start, a.minutes ?? 60),
    status: a.status ?? 'confirmed',
    is_sample: a.isSample ?? false,
    ...owner,
  };
  const result = await service.from('appointments').insert(row).select('id').single();
  if (result.data) createdAppointments.push(result.data.id);
  return result;
}

export async function addTimeBlock(stylistId: string, start: Date, minutes: number) {
  const { data, error } = await service
    .from('time_blocks')
    .insert({ stylist_id: stylistId, during: range(start, minutes), kind: 'block' })
    .select('id')
    .single();
  if (error) throw new Error(`addTimeBlock: ${error.message}`);
  createdBlocks.push(data.id);
  return data.id;
}

export async function offerService(stylistId: string, serviceId: string): Promise<void> {
  const { error } = await service
    .from('stylist_services')
    .insert({ stylist_id: stylistId, service_id: serviceId });
  if (error) throw new Error(`offerService: ${error.message}`);
}

// Horario semanal de una estilista (se borra con la estilista, por cascade).
export async function setSchedule(
  stylistId: string,
  weekday: number,
  starts: string,
  ends: string,
): Promise<void> {
  const { error } = await service
    .from('stylist_schedule')
    .insert({ stylist_id: stylistId, weekday, starts, ends });
  if (error) throw new Error(`setSchedule: ${error.message}`);
}

const createdSalonHours: string[] = [];

// Horario del salón para un día que la semilla no cubre (p. ej. el domingo, 7).
export async function ensureSalonHours(weekday: number, opens: string, closes: string): Promise<void> {
  const { data } = await service
    .from('salon_hours')
    .select('id')
    .eq('weekday', weekday)
    .eq('opens', opens)
    .maybeSingle();
  if (data) return;
  const inserted = await service
    .from('salon_hours')
    .insert({ weekday, opens, closes })
    .select('id')
    .single();
  if (inserted.error) throw new Error(`ensureSalonHours: ${inserted.error.message}`);
  createdSalonHours.push(inserted.data.id);
}

export async function cleanup(): Promise<void> {
  if (createdSalonHours.length) await service.from('salon_hours').delete().in('id', createdSalonHours);
  createdSalonHours.length = 0;
  if (createdAppointments.length) await service.from('appointments').delete().in('id', createdAppointments);
  // T-022: también TODAS las citas de los estilistas y servicios creados aquí, no solo las registradas: las
  // citas hechas con `create_booking` o anonimizadas por los tests de borrado no están en `createdAppointments`
  // y, por `on delete restrict`, impedirían borrar el estilista o el servicio y los dejarían como resto.
  if (createdStylists.length) await service.from('appointments').delete().in('stylist_id', createdStylists);
  if (createdServices.length) await service.from('appointments').delete().in('service_id', createdServices);
  if (createdBlocks.length) await service.from('time_blocks').delete().in('id', createdBlocks);
  if (createdStylists.length) await service.from('stylists').delete().in('id', createdStylists);
  if (createdServices.length) await service.from('services').delete().in('id', createdServices);
  for (const id of createdUsers) await service.auth.admin.deleteUser(id);
  createdAppointments.length = 0;
  createdBlocks.length = 0;
  createdStylists.length = 0;
  createdServices.length = 0;
  createdUsers.length = 0;
}
