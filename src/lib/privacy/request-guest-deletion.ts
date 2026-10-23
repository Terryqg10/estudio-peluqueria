import { getKeyHash } from '@/lib/booking/client-ip.server';
import { createEmailSender } from '@/lib/email/create-sender';
import { getEmailEnv } from '@/lib/email/env.server';
import { renderDeletionRequest } from '@/lib/email/templates/deletion-request';
import { ROUTES } from '@/lib/routes';
import { SITE } from '@/lib/site';
import { createServiceClient } from '@/lib/supabase/service-client';
import { DeletionEmailSchema, type RequestDeletionResult } from './schema';

// Cupo de solicitudes (ADR-0032, mismo mecanismo que el del acceso). Provisional: VERIFICAR con el salón.
export const DELETION_REQUEST_LIMITS = { maxPerEmail: 3, maxPerIp: 10, windowMinutes: 60 } as const;

// Pide el borrado con el email (T-020, RF-09, CA-40, CA-41). Orden: Zod → cupo (BD) → token (BD) →
// email. La respuesta es IDÉNTICA exista o no el email, se supere o no el cupo y falle o no el envío:
// no hay enumeración de emails con citas. Solo fallan de forma distinta la entrada inválida (se ve en
// el propio formulario) y la indisponibilidad del servicio, que no dependen de los datos de nadie.
// El enlace se construye desde `APP_URL`, nunca desde `Host`.
export async function requestGuestDeletion(
  input: unknown,
  context: { ipHash: string | null } = { ipHash: null },
): Promise<RequestDeletionResult> {
  const parsed = DeletionEmailSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'INVALID_INPUT',
      message: parsed.error.issues[0]?.message ?? 'Escribe un email válido',
    };
  }
  const { email } = parsed.data;

  try {
    // El email no se guarda en claro ni para el cupo: HMAC con la sal de servidor.
    const emailKey = getKeyHash(`delete-email:${email}`);
    const service = createServiceClient();
    if (!emailKey || !service) return { ok: false, error: 'UNAVAILABLE' };

    const quota = await service.rpc('consume_deletion_request_quota', {
      p_email_hash: emailKey,
      ...(context.ipHash ? { p_ip_hash: context.ipHash } : {}),
      p_max_per_email: DELETION_REQUEST_LIMITS.maxPerEmail,
      p_max_per_ip: DELETION_REQUEST_LIMITS.maxPerIp,
      p_window_minutes: DELETION_REQUEST_LIMITS.windowMinutes,
    });
    if (quota.error) {
      if (quota.error.message === 'LIMIT_EMAIL' || quota.error.message === 'LIMIT_IP') {
        console.warn(`[borrado] cupo de solicitudes superado (${quota.error.message}); no se envía`);
        return { ok: true };
      }
      return { ok: false, error: 'UNAVAILABLE' };
    }

    const issued = await service.rpc('request_guest_deletion', { p_email: email });
    if (issued.error) return { ok: false, error: 'UNAVAILABLE' };
    if (!issued.data) return { ok: true }; // sin citas de ese email: no se envía nada y no se dice

    // A partir de aquí un fallo no cambia la respuesta (no revelar que el email tiene citas). Se
    // registra sin email, token ni enlace.
    const env = getEmailEnv();
    const sender = env ? createEmailSender(env) : null;
    if (!env || !sender) {
      console.error('[borrado] no se pudo enviar la solicitud: email sin configurar');
      return { ok: true };
    }
    const link = `${env.appUrl}${ROUTES.borrarDatosConfirmar}?token=${issued.data}`;
    const sent = await sender.send({ to: email, ...renderDeletionRequest({ salonName: SITE.name, link }) });
    if (!sent.ok) console.error('[borrado] no se pudo enviar la solicitud', { reason: sent.reason });
    return { ok: true };
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}
