import { z } from 'zod';

// Entrada externa de la consulta de disponibilidad (RNF-02): se valida en el límite.
export const AvailabilityQuerySchema = z.object({
  serviceId: z.string().uuid(),
  // Fecha local del salón, YYYY-MM-DD, y que sea un día real del calendario.
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const [y, m, d] = value.split('-').map(Number);
      const parsed = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
      return (
        parsed.getUTCFullYear() === y &&
        parsed.getUTCMonth() === (m ?? 1) - 1 &&
        parsed.getUTCDate() === d
      );
    }, 'Fecha inexistente'),
  stylistId: z.string().uuid().optional(),
});

export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;

export type AvailabilitySlot = {
  stylistId: string;
  startsAt: string; // ISO 8601 en UTC
};

export type AvailabilityResult =
  | { ok: true; slots: AvailabilitySlot[] }
  | { ok: false; error: 'INVALID_INPUT' | 'UNAVAILABLE' };
