import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { DEMO_EMAIL, DEMO_ENTRY_LIMITS, isDemoEnabled } from './config';

export type EnterDemoResult =
  | { ok: true }
  | { ok: false; error: 'DISABLED' | 'LIMIT' | 'UNAVAILABLE' };

type Deps = {
  // Cliente con la clave de servicio: solo para el cupo, la cuenta y el enlace. NUNCA llega al navegador.
  service: SupabaseClient<Database> | null;
  // Cliente con las cookies de la petición: aquí queda la sesión.
  auth: SupabaseClient<Database> | null;
  enabled?: boolean;
};

// Abre la sesión de la cuenta demo sin email (ADR-0036). Orden: activada → cupo por IP → cuenta (rol demo) → sesión.
// Nunca abre la sesión de una cuenta con otro rol: si la del email fijo fuera admin, se falla cerrado.
export async function enterDemo(context: { ipHash: string | null }, deps: Deps): Promise<EnterDemoResult> {
  if (!(deps.enabled ?? isDemoEnabled())) return { ok: false, error: 'DISABLED' };
  const { service, auth } = deps;
  if (!service || !auth) return { ok: false, error: 'UNAVAILABLE' };

  if (context.ipHash) {
    const quota = await service.rpc('consume_demo_entry_quota', {
      p_ip_hash: context.ipHash,
      p_max_per_ip: DEMO_ENTRY_LIMITS.maxPerIp,
      p_window_minutes: DEMO_ENTRY_LIMITS.windowMinutes,
    });
    if (quota.error) {
      if (quota.error.message === 'LIMIT_IP') return { ok: false, error: 'LIMIT' };
      return { ok: false, error: 'UNAVAILABLE' };
    }
  }

  // `generateLink` no envía ningún email y crea la cuenta si todavía no existe (primera entrada).
  const link = await service.auth.admin.generateLink({ type: 'magiclink', email: DEMO_EMAIL });
  const user = link.data?.user;
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !user || !tokenHash) return { ok: false, error: 'UNAVAILABLE' };

  const profile = await service.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile.error) return { ok: false, error: 'UNAVAILABLE' };
  if (profile.data?.role === 'admin') return { ok: false, error: 'UNAVAILABLE' };
  if (profile.data?.role !== 'demo') {
    const promoted = await service.from('profiles').upsert({ id: user.id, role: 'demo' }, { onConflict: 'id' });
    if (promoted.error) return { ok: false, error: 'UNAVAILABLE' };
  }

  const session = await auth.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  if (session.error || !session.data.session) return { ok: false, error: 'UNAVAILABLE' };
  return { ok: true };
}
