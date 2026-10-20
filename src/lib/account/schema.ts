import { z } from 'zod';

// Entradas del acceso por enlace mágico (ADR-0021). Compartido entre cliente y servidor.
export const LoginEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Escribe tu email')
    .max(254, 'El email es demasiado largo')
    .email('Escribe un email válido, por ejemplo nombre@correo.com'),
});

// `token_hash` que Supabase pone en el enlace del email (URL-safe, sin espacios). Se acota la
// longitud y el alfabeto antes de llamar a Auth.
export const TokenHashSchema = z
  .string()
  .min(8)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);

export type LoginLinkResult =
  | { ok: true }
  | { ok: false; error: 'INVALID_INPUT'; message: string }
  | { ok: false; error: 'UNAVAILABLE' };

export type ConfirmResult =
  | { ok: true; destination: 'admin' | 'cuenta' } // el Admin va al panel; las demás cuentas, a «mis citas»
  | { ok: false; error: 'INVALID_LINK' | 'UNAVAILABLE' };

// Estado del formulario de acceso (acción de servidor con useActionState). Lleva el email para no
// vaciar el campo; nunca dice si la cuenta existe.
export type LoginFormState =
  | { status: 'idle'; email: string }
  | { status: 'sent'; email: string }
  | { status: 'invalid'; email: string; message: string }
  | { status: 'unavailable'; email: string };
