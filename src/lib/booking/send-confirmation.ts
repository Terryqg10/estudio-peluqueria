import { createEmailSender } from '@/lib/email/create-sender';
import { getEmailEnv } from '@/lib/email/env.server';
import { renderBookingConfirmation } from '@/lib/email/templates/booking-confirmation';
import type { EmailSender } from '@/lib/email/types';
import { ROUTES } from '@/lib/routes';
import { SITE } from '@/lib/site';
import { createServiceClient } from '@/lib/supabase/service-client';
import type { Database } from '@/lib/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseRange } from './range';

export type ConfirmationFailure =
  | 'NOT_CONFIGURED'
  | 'NOT_FOUND'
  | 'TOKEN_FAILED'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT'
  | 'MISCONFIGURED'
  | 'UNEXPECTED';

export type ConfirmationResult = { ok: true } | { ok: false; reason: ConfirmationFailure };

export type Deps = {
  client: SupabaseClient<Database> | null;
  sender: EmailSender | null;
  appUrl: string | null;
};

function defaultDeps(): Deps {
  const env = getEmailEnv();
  return {
    client: createServiceClient(),
    sender: env ? createEmailSender(env) : null,
    appUrl: env?.appUrl ?? null,
  };
}

// Solo el identificador de la cita y el tipo de fallo: nunca email, nombre, token ni enlace (ADR-0018).
function logFailure(appointmentId: string, reason: ConfirmationFailure): void {
  console.error('[email] no se pudo enviar la confirmación', { appointmentId, reason });
}

// Emite el token, construye el enlace desde APP_URL (nunca desde `Host`), envía el email y marca el envío.
// NUNCA lanza: si algo falla, la cita se mantiene y se devuelve el motivo (ADR-0018).
export async function sendBookingConfirmation(
  appointmentId: string,
  deps: Deps = defaultDeps(),
): Promise<ConfirmationResult> {
  const fail = (reason: ConfirmationFailure): ConfirmationResult => {
    logFailure(appointmentId, reason);
    return { ok: false, reason };
  };

  try {
    const { client, sender, appUrl } = deps;
    if (!client || !sender || !appUrl) return fail('NOT_CONFIGURED');

    const { data: row, error } = await client
      .from('appointments')
      .select('guest_name, guest_email, during, services(name), stylists(name)')
      .eq('id', appointmentId)
      .maybeSingle();
    const range = parseRange(row?.during);
    if (error || !row || !row.guest_email || !row.guest_name || !row.services || !row.stylists || !range) {
      return fail('NOT_FOUND');
    }

    // El token en claro solo existe aquí, en memoria: no se guarda ni se registra (ADR-0009).
    const issued = await client.rpc('issue_management_token', { p_appointment_id: appointmentId });
    if (issued.error || !issued.data) return fail('TOKEN_FAILED');
    const link = `${appUrl}/cita/${issued.data}`;

    const content = renderBookingConfirmation({
      salonName: SITE.name,
      guestName: row.guest_name,
      serviceName: row.services.name,
      stylistName: row.stylists.name,
      startsAt: range.start,
      link,
      deleteLink: `${appUrl}${ROUTES.borrarDatos}`,
    });

    const sent = await sender.send({ to: row.guest_email, ...content });
    if (!sent.ok) return fail(sent.reason);

    // Constancia del envío. Si falla, el email ya salió: se registra y se sigue.
    const marked = await client
      .from('appointments')
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq('id', appointmentId);
    if (marked.error) logFailure(appointmentId, 'UNEXPECTED');
    return { ok: true };
  } catch {
    return fail('UNEXPECTED');
  }
}
