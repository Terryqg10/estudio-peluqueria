import { randomUUID } from 'node:crypto';
import { expect, type Browser, type Page } from '@playwright/test';
import { deleteEmailsTo, waitForLoginPath } from './mailpit';
import { deleteAccount } from './supabase-admin';

// Flujo de acceso por enlace mágico compartido por los e2e de la cuenta (T-007) y del panel (T-008a).
export const newEmail = (prefix = 'acceso') => `${prefix}-${randomUUID()}@test.invalid`;
export const SENT = /te hemos enviado un enlace/;

export async function requestLink(page: Page, email: string) {
  await page.goto('/acceso');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
  await expect(page.getByRole('status')).toContainText(SENT);
}

// Abre el enlace del correo y entra pulsando el botón (el GET solo muestra el botón).
export async function confirmFromEmail(page: Page, email: string) {
  const path = await waitForLoginPath(email);
  await page.goto(path);
  await page.getByRole('button', { name: 'Entrar en mi cuenta' }).click();
}

// Pide el enlace, entra y espera el destino (por defecto «mis citas», el de una clienta).
export async function signIn(page: Page, email: string, landing: RegExp = /\/mis-citas$/) {
  await requestLink(page, email);
  await confirmFromEmail(page, email);
  await expect(page).toHaveURL(landing);
}

export async function cleanup(emails: string[]) {
  for (const email of emails) {
    await deleteAccount(email);
    await deleteEmailsTo(email);
  }
}

export async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}
