import { z } from 'zod';
import type { AvailabilitySlot } from '@/lib/availability/schema';

// Mismas reglas que la función de BD `create_booking` (ADR-0015): la app valida primero con Zod
// y la BD vuelve a validar (defensa en profundidad). Compartido entre cliente y servidor.
const NAME_RE = /^[\p{L}][\p{L}\p{M} .'’-]*$/u;
const PHONE_RE = /^\+?[0-9(][0-9 ()-]{7,18}[0-9]$/;

export const BookingFormSchema = z.object({
  serviceId: z.string().uuid(),
  stylistId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  name: z
    .string()
    .trim()
    .min(2, 'Escribe tu nombre')
    .max(80, 'El nombre es demasiado largo')
    .regex(NAME_RE, 'El nombre solo puede llevar letras, espacios, puntos y guiones'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'El email es demasiado largo')
    .email('Escribe un email válido, por ejemplo nombre@correo.com'),
  phone: z
    .string()
    .trim()
    .regex(PHONE_RE, 'Escribe un teléfono válido, por ejemplo 600 000 000')
    .refine((value) => {
      const digits = value.replace(/\D/g, '').length;
      return digits >= 9 && digits <= 15;
    }, 'Escribe un teléfono válido, por ejemplo 600 000 000'),
  consent: z.boolean().refine((value) => value === true, 'Debes aceptar para poder reservar'),
  // Honeypot (ADR-0016): un campo que una persona no ve ni rellena.
  website: z.string().max(200).optional(),
});

export type BookingFormInput = z.input<typeof BookingFormSchema>;
export type BookingFormData = z.infer<typeof BookingFormSchema>;

export type FieldName = 'name' | 'email' | 'phone' | 'consent';
export type FieldErrors = Partial<Record<FieldName, string>>;

export type BookingResult =
  | { ok: true }
  | { ok: false; error: 'INVALID_INPUT'; fieldErrors: FieldErrors }
  | { ok: false; error: 'SLOT_TAKEN'; alternatives: AvailabilitySlot[] }
  | { ok: false; error: 'OUT_OF_WINDOW' | 'UNAVAILABLE' | 'LIMIT_EMAIL' | 'LIMIT_IP' };

// Primer mensaje de error por campo del formulario, a partir de los problemas de Zod.
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const fields: readonly FieldName[] = ['name', 'email', 'phone', 'consent'];
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    const field = fields.find((f) => f === key);
    if (field && !result[field]) result[field] = issue.message;
  }
  return result;
}
