import { z } from 'zod';

// Enlace público de WhatsApp (`wa.me`), sin API (spec, sección 10). El número va sin «+» ni espacios, con el
// prefijo del país (E.164 sin el «+»): de 8 a 15 cifras y sin cero inicial.
export const WhatsappNumberSchema = z.string().regex(/^[1-9]\d{7,14}$/);

export const WHATSAPP_GREETING = 'Hola, me gustaría hablar con una persona del salón.';

// Devuelve la URL o `null` si el número falta o no es válido (el chat entonces muestra el teléfono del salón).
export function buildWhatsappUrl(number: string | undefined | null, text: string = WHATSAPP_GREETING): string | null {
  const parsed = WhatsappNumberSchema.safeParse(number ?? '');
  if (!parsed.success) return null;
  return `https://wa.me/${parsed.data}?text=${encodeURIComponent(text)}`;
}
