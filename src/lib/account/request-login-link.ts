import { getKeyHash } from '@/lib/booking/client-ip.server';
import { createPublicClient } from '@/lib/supabase/public-client';
import { createServiceClient } from '@/lib/supabase/service-client';
import { LoginEmailSchema, type LoginLinkResult } from './schema';

// Cupo de envíos del enlace (ADR-0021, mismo mecanismo que ADR-0020). Provisional: VERIFICAR con el salón.
export const LOGIN_LINK_LIMITS = { maxPerEmail: 3, maxPerIp: 10, windowMinutes: 60 } as const;

// Pide el enlace mágico. Orden: Zod → cupo (BD) → Auth. La respuesta es IDÉNTICA exista o no la
// cuenta y también cuando se supera el cupo (no se envía, pero no se avisa): no hay enumeración de
// cuentas ni de emails con cupo agotado. Solo fallan de forma distinta la entrada inválida (se ve
// en el propio formulario) y la indisponibilidad del servicio.
export async function requestLoginLink(
  input: unknown,
  context: { ipHash: string | null } = { ipHash: null },
): Promise<LoginLinkResult> {
  const parsed = LoginEmailSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'INVALID_INPUT',
      message: parsed.error.issues[0]?.message ?? 'Escribe un email válido',
    };
  }
  const { email } = parsed.data;

  // El email no se guarda en claro ni para el cupo: HMAC con la sal de servidor.
  const emailKey = getKeyHash(`login-email:${email}`);
  const service = createServiceClient();
  if (!emailKey || !service) return { ok: false, error: 'UNAVAILABLE' };

  const quota = await service.rpc('consume_login_link_quota', {
    p_email_hash: emailKey,
    ...(context.ipHash ? { p_ip_hash: context.ipHash } : {}),
    p_max_per_email: LOGIN_LINK_LIMITS.maxPerEmail,
    p_max_per_ip: LOGIN_LINK_LIMITS.maxPerIp,
    p_window_minutes: LOGIN_LINK_LIMITS.windowMinutes,
  });
  if (quota.error) {
    if (quota.error.message === 'LIMIT_EMAIL' || quota.error.message === 'LIMIT_IP') {
      console.warn(`[acceso] cupo de enlaces superado (${quota.error.message}); no se envía`);
      return { ok: true };
    }
    return { ok: false, error: 'UNAVAILABLE' };
  }

  // Cliente sin sesión ni cookies: solo pide el email. La sesión se abre al confirmar el enlace.
  const auth = createPublicClient();
  if (!auth) return { ok: false, error: 'UNAVAILABLE' };
  const { error } = await auth.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) {
    // Auth impone un intervalo mínimo entre correos a la misma dirección. Responder con un error
    // aquí distinguiría «a este email ya se le envió uno hace poco» de «no»: se trata como éxito,
    // que además es cierto (ya tiene un enlace reciente en su bandeja).
    if (error.code === 'over_email_send_rate_limit') {
      console.warn('[acceso] Auth aplicó su intervalo mínimo entre correos; no se reenvía');
      return { ok: true };
    }
    // Con shouldCreateUser no hay error que dependa de si existe la cuenta: es un fallo del servicio.
    console.error(`[acceso] Auth no pudo enviar el enlace (${error.code ?? error.status ?? 'error'})`);
    return { ok: false, error: 'UNAVAILABLE' };
  }
  return { ok: true };
}
