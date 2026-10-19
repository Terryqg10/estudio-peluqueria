import { z } from 'zod';
import { madridDateOf } from './dates';

// Aviso de Realtime (ADR-0013). Es una entrada externa: se valida con Zod (RNF-02).
// El mensaje no lleva datos personales; Realtime añade un `id` propio que se ignora.
const AvailabilityMessageSchema = z.object({
  stylist_id: z.string().uuid(),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  op: z.string(),
});

export type AvailabilityContext = {
  date: string; // YYYY-MM-DD en Europe/Madrid
  stylistIds: readonly string[]; // estilistas que se están mostrando
};

// ¿Afecta este aviso a lo que se está viendo? (misma estilista y día solapado)
export function isRelevantMessage(raw: unknown, context: AvailabilityContext): boolean {
  const parsed = AvailabilityMessageSchema.safeParse(raw);
  if (!parsed.success) return false;
  const { stylist_id, starts_at, ends_at } = parsed.data;
  if (!context.stylistIds.includes(stylist_id)) return false;
  const first = madridDateOf(starts_at);
  const last = madridDateOf(ends_at);
  return first <= context.date && context.date <= last;
}

// Sondeo de respaldo (ADR-0013): N = 15 s sin canal activo; verificación cada 60 s con canal.
export const POLL_FALLBACK_MS = 15_000;
export const POLL_VERIFY_MS = 60_000;

export function pollIntervalMs(channelLive: boolean): number {
  return channelLive ? POLL_VERIFY_MS : POLL_FALLBACK_MS;
}
