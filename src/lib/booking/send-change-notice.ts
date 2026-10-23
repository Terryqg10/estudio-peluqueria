import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { createEmailSender } from '@/lib/email/create-sender';
import { getEmailEnv } from '@/lib/email/env.server';
import { renderChangeNotice, type ChangeKind } from '@/lib/email/templates/change-notice';
import type { EmailSender } from '@/lib/email/types';
import { ROUTES } from '@/lib/routes';
import { SITE } from '@/lib/site';
import { createServiceClient } from '@/lib/supabase/service-client';
import { parseRange } from './range';

export type ChangeNoticeFailure =
  | 'NOT_CONFIGURED'
  | 'NOT_FOUND'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT'
  | 'MISCONFIGURED'
  | 'UNEXPECTED';

export type ChangeNoticeResult = { ok: true } | { ok: false; reason: ChangeNoticeFailure };

export type ChangeNoticeDeps = {
  client: SupabaseClient<Database> | null;
  sender: EmailSender | null;
  appUrl: string | null;
};

function defaultDeps(): ChangeNoticeDeps {
  const env = getEmailEnv();
  return {
    client: createServiceClient(),
    sender: env ? createEmailSender(env) : null,
    appUrl: env?.appUrl ?? null,
  };
}

// Solo el identificador de la cita y el tipo de fallo: nunca email, nombre ni enlace (como ADR-0018).
function logFailure(appointmentId: string, kind: ChangeKind, reason: ChangeNoticeFailure): void {
  console.error('[email] no se pudo enviar el aviso de cambio', { appointmentId, kind, reason });
}

// Avisa a la invitada de que su cita se ha cancelado o cambiado desde el enlace (T-006d, RF-05,
// RF-11, CA-42, CA-43, ADR-0033). Se llama DESPUÉS de que la BD confirme la operación. NO emite un
// token (invalidaría el enlace del email anterior). NUNCA lanza: si algo falla, la operación ya
// hecha se mantiene y se devuelve el motivo.
export async function sendChangeNotice(
  appointmentId: string,
  kind: ChangeKind,
  deps: ChangeNoticeDeps = defaultDeps(),
): Promise<ChangeNoticeResult> {
  const fail = (reason: ChangeNoticeFailure): ChangeNoticeResult => {
    logFailure(appointmentId, kind, reason);
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

    const content = renderChangeNotice({
      kind,
      salonName: SITE.name,
      guestName: row.guest_name,
      serviceName: row.services.name,
      stylistName: row.stylists.name,
      startsAt: range.start,
      reserveLink: `${appUrl}${ROUTES.reservar}`,
    });

    const sent = await sender.send({ to: row.guest_email, ...content });
    if (!sent.ok) return fail(sent.reason);
    return { ok: true };
  } catch {
    return fail('UNEXPECTED');
  }
}
