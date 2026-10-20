'use server';

import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { ROUTES } from '@/lib/routes';

export async function signOutAction(): Promise<void> {
  const client = await createAuthClient();
  await client?.auth.signOut();
  redirect(ROUTES.acceso);
}
