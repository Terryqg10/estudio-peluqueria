'use server';

import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getClientIpHash } from '@/lib/booking/client-ip.server';
import { isDemoEnabled } from '@/lib/demo/config';
import { enterDemo } from '@/lib/demo/enter-demo';
import { ROUTES } from '@/lib/routes';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServiceClient } from '@/lib/supabase/service-client';

export type DemoEntryState = { status: 'idle' } | { status: 'limit' } | { status: 'unavailable' };

// «Probar el panel» (ADR-0036). Sin `DEMO_ENABLED=1` la acción no existe: responde 404 (CA-48). No recibe datos del
// navegador: la identidad de la cuenta es fija y la IP sale de las cabeceras de la plataforma.
export async function enterDemoAction(_previous: DemoEntryState): Promise<DemoEntryState> {
  if (!isDemoEnabled()) notFound();

  // Si falta la sal en producción se falla cerrado, como en el resto de límites por IP.
  const ip = getClientIpHash(await headers());
  if (!ip.ok) return { status: 'unavailable' };

  const result = await enterDemo({ ipHash: ip.ipHash }, { service: createServiceClient(), auth: await createAuthClient() });
  if (result.ok) redirect(ROUTES.admin);
  if (result.error === 'DISABLED') notFound();
  return { status: result.error === 'LIMIT' ? 'limit' : 'unavailable' };
}
