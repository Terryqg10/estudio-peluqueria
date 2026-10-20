import { z } from 'zod';

// 32 bytes en base64url sin relleno = 43 caracteres (ADR-0009).
export const TokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
