import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/lib/database.types';

// Gestión de servicios del Admin (T-009a, RF-07, CA-18). Todo con el cliente de la sesión del Admin:
// `admin_save_service` vuelve a validar y exige `is_admin()`.

export const MAX_PRICE_EUROS = 9999;

// «45», «45,5», «45.50» → céntimos. Sin separador de miles ni símbolo de moneda.
export function eurosToCents(value: string): number | null {
  const match = /^(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const euros = Number(match[1]);
  const cents = Number((match[2] ?? '').padEnd(2, '0') || '0');
  const total = euros * 100 + cents;
  return euros <= MAX_PRICE_EUROS ? total : null;
}

export function centsToEuros(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(euros) : `${euros},${String(rest).padStart(2, '0')}`;
}

export const ServiceFormSchema = z.object({
  name: z.string().trim().min(2, 'Escribe un nombre de al menos 2 letras').max(80, 'El nombre es demasiado largo (máximo 80)'),
  category: z.string().trim().min(2, 'Escribe una categoría').max(40, 'La categoría es demasiado larga (máximo 40)'),
  price: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const cents = eurosToCents(value);
      if (cents === null) {
        ctx.addIssue({ code: 'custom', message: 'Escribe un precio válido, por ejemplo 45 o 45,50 (hasta 9.999 €)' });
        return z.NEVER;
      }
      return cents;
    }),
  duration: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, 'Escribe la duración en minutos, por ejemplo 60')
    .transform(Number)
    .refine((n) => n >= 5 && n <= 480 && n % 5 === 0, 'La duración va de 5 a 480 minutos, de 5 en 5'),
  active: z.boolean(),
  stylistIds: z.array(z.string().uuid()).max(50),
});

export type ServiceFormInput = z.input<typeof ServiceFormSchema>;
export type ServiceFormData = z.output<typeof ServiceFormSchema>;

export type SaveServiceError = 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' | 'DUPLICATE_NAME' | 'UNAVAILABLE';

export type SaveServiceResult =
  | { ok: true; id: string }
  | { ok: false; error: SaveServiceError; fieldErrors?: Partial<Record<'name' | 'category' | 'price' | 'duration', string>> };

const KNOWN: Record<string, SaveServiceError> = {
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  DUPLICATE_NAME: 'DUPLICATE_NAME',
};

export async function saveService(
  client: SupabaseClient<Database>,
  id: string | null,
  input: unknown,
): Promise<SaveServiceResult> {
  const idCheck = id === null ? { success: true as const } : z.string().uuid().safeParse(id);
  const parsed = ServiceFormSchema.safeParse(input);
  if (!idCheck.success) return { ok: false, error: 'NOT_FOUND' };
  if (!parsed.success) {
    const fieldErrors: Partial<Record<'name' | 'category' | 'price' | 'duration', string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if ((key === 'name' || key === 'category' || key === 'price' || key === 'duration') && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, error: 'INVALID_INPUT', fieldErrors };
  }

  try {
    const { data, error } = await client.rpc('admin_save_service', {
      p_category: parsed.data.category,
      p_name: parsed.data.name,
      p_price_from_cents: parsed.data.price,
      p_duration_min: parsed.data.duration,
      p_active: parsed.data.active,
      p_stylist_ids: parsed.data.stylistIds,
      p_id: id ?? undefined,
    });
    if (error) return { ok: false, error: KNOWN[error.message] ?? 'UNAVAILABLE' };
    return typeof data === 'string' ? { ok: true, id: data } : { ok: false, error: 'UNAVAILABLE' };
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}

export type AdminService = {
  id: string;
  name: string;
  category: string;
  priceCents: number;
  durationMin: number;
  active: boolean;
  stylistIds: string[];
};

export type AdminStylist = { id: string; name: string };

// Todos los servicios (también los inactivos: el Admin los ve por su RLS), en el orden de la web.
export async function loadAdminServices(
  client: SupabaseClient<Database>,
): Promise<{ services: AdminService[]; stylists: AdminStylist[] } | 'error'> {
  const [services, offers, stylists] = await Promise.all([
    client
      .from('services')
      .select('id, name, category, price_from_cents, duration_min, active')
      .order('sort_order', { ascending: true }),
    client.from('stylist_services').select('stylist_id, service_id'),
    client.from('stylists').select('id, name').eq('active', true).order('name', { ascending: true }),
  ]);
  if (services.error || offers.error || stylists.error) return 'error';

  return {
    services: services.data.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      priceCents: s.price_from_cents,
      durationMin: s.duration_min,
      active: s.active,
      stylistIds: offers.data.filter((o) => o.service_id === s.id).map((o) => o.stylist_id),
    })),
    stylists: stylists.data,
  };
}

// Citas futuras no canceladas de un servicio: al desactivarlo se mantienen (spec, sección 5).
export async function countFutureAppointments(
  client: SupabaseClient<Database>,
  serviceId: string,
): Promise<number | null> {
  const { data, error } = await client
    .from('panel_appointments')
    .select('id, during')
    .eq('service_id', serviceId)
    .neq('status', 'cancelled')
    .overlaps('during', `[${new Date().toISOString()},infinity)`);
  return error ? null : data.length;
}
