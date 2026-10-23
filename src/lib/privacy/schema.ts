import { z } from 'zod';

// Entrada del formulario de borrado por email (T-020, ADR-0032). Mismas reglas que el acceso.
export const DeletionEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Escribe tu email')
    .max(254, 'El email es demasiado largo')
    .email('Escribe un email válido, por ejemplo nombre@correo.com'),
});

export type DeletionFormState =
  | { status: 'idle'; email: string }
  | { status: 'sent'; email: string }
  | { status: 'invalid'; email: string; message: string }
  | { status: 'unavailable'; email: string };

export type RequestDeletionResult =
  | { ok: true }
  | { ok: false; error: 'INVALID_INPUT'; message: string }
  | { ok: false; error: 'UNAVAILABLE' };
