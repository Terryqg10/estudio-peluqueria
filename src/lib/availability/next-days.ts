import { addDays } from '@/lib/booking/dates';
import { getAvailability } from './get-availability';
import { AvailabilityQuerySchema } from './schema';

export type NextDay = { date: string; count: number };

export type NextDaysResult = { ok: true; days: NextDay[] } | { ok: false };

const SCAN_DAYS = 14;
const MAX_RESULTS = 5;

// Cuando un día no tiene huecos, propone los próximos días con disponibilidad (spec, sección 6).
// `date` es el día ya consultado; se revisan los 14 siguientes (la ventana de reserva la aplica la BD).
export async function findNextDaysWithSlots(input: unknown): Promise<NextDaysResult> {
  const parsed = AvailabilityQuerySchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { serviceId, date, stylistId } = parsed.data;

  const dates = Array.from({ length: SCAN_DAYS }, (_, i) => addDays(date, i + 1));
  const results = await Promise.all(
    dates.map(async (day) => ({
      date: day,
      result: await getAvailability({ serviceId, date: day, stylistId }),
    })),
  );

  const days: NextDay[] = [];
  for (const { date: day, result } of results) {
    if (!result.ok) return { ok: false };
    const count = new Set(result.slots.map((s) => s.startsAt)).size;
    if (count > 0) days.push({ date: day, count });
    if (days.length === MAX_RESULTS) break;
  }
  return { ok: true, days };
}
