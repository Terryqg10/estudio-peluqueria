'use server';

import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { deleteAccountData, type DeleteAccountResult } from '@/lib/privacy/delete-account-data';
import { ROUTES } from '@/lib/routes';

export async function signOutAction(): Promise<void> {
  const client = await createAuthClient();
  await client?.auth.signOut();
  redirect(ROUTES.acceso);
}

// Borra la cuenta y anonimiza las citas (T-012, CA-26). La identidad sale de la sesión.
export async function deleteAccountAction(): Promise<DeleteAccountResult> {
  return deleteAccountData(true);
}
