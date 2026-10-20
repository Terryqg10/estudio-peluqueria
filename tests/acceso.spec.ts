import { randomUUID } from 'node:crypto';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { deleteEmailsTo, emailCountTo, waitForLoginPath } from './helpers/mailpit';
import {
  createAccountAppointment,
  deleteAccount,
  userIdByEmail,
} from './helpers/supabase-admin';

// T-007: acceso por enlace mágico y «mis citas» (CA-12, ADR-0021). Cada test usa emails únicos.
const newEmail = () => `acceso-${randomUUID()}@test.invalid`;
const SENT = /te hemos enviado un enlace/;

async function requestLink(page: Page, email: string) {
  await page.goto('/acceso');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
  await expect(page.getByRole('status')).toContainText(SENT);
}

// Pide el enlace, lo abre desde el correo y entra pulsando el botón (el GET solo muestra el botón).
async function signIn(page: Page, email: string) {
  await requestLink(page, email);
  const path = await waitForLoginPath(email);
  await page.goto(path);
  await page.getByRole('button', { name: 'Entrar en mi cuenta' }).click();
  await expect(page).toHaveURL(/\/mis-citas$/);
}

async function cleanup(emails: string[]) {
  for (const email of emails) {
    await deleteAccount(email);
    await deleteEmailsTo(email);
  }
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test.describe('acceso por enlace mágico', () => {
  test('sin sesión, /mis-citas lleva al acceso', async ({ page }) => {
    await page.goto('/mis-citas');
    await expect(page).toHaveURL(/\/acceso$/);
    await expect(page.getByRole('heading', { name: 'Acceder a mis citas' })).toBeVisible();
  });

  test('un email inválido muestra el error junto al campo y no envía nada', async ({ page }) => {
    await page.goto('/acceso');
    await page.getByLabel('Email').fill('no-es-un-email');
    await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
    await expect(page.getByText('Escribe un email válido')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeFocused();
    await expect(page.getByRole('status')).toHaveCount(0);
    expect(page.url()).not.toContain('email');
  });

  test('entra con el enlace del email, ve «mis citas» vacío y puede salir', async ({ page }) => {
    const email = newEmail();
    try {
      await signIn(page, email);
      await expect(page.getByRole('heading', { name: 'Mis citas' })).toBeVisible();
      await expect(page.getByText(`Has entrado como ${email}`)).toBeVisible();
      await expect(page.getByText('Todavía no tienes citas en tu cuenta.')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Reservar una cita' })).toBeVisible();

      // La sesión persiste al recargar y /acceso ya no pide otro enlace.
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Mis citas' })).toBeVisible();
      await page.goto('/acceso');
      await expect(page).toHaveURL(/\/mis-citas$/);

      await page.getByRole('button', { name: 'Salir' }).click();
      await expect(page).toHaveURL(/\/acceso$/);
      await page.goto('/mis-citas');
      await expect(page).toHaveURL(/\/acceso$/);
    } finally {
      await cleanup([email]);
    }
  });

  test('CA-12: cada clienta ve solo sus citas en «mis citas»', async ({ browser }) => {
    const emailA = newEmail();
    const emailB = newEmail();
    const a = await freshPage(browser);
    const b = await freshPage(browser);
    try {
      await signIn(a.page, emailA);
      await signIn(b.page, emailB);
      const idA = await userIdByEmail(emailA);
      const idB = await userIdByEmail(emailB);
      expect(idA && idB).toBeTruthy();

      await createAccountAppointment(idA ?? '', 30);
      await createAccountAppointment(idB ?? '', 31);
      await createAccountAppointment(idB ?? '', 32);

      await a.page.reload();
      await b.page.reload();
      await expect(a.page.getByRole('listitem').filter({ hasText: 'Tratamiento hidratante' })).toHaveCount(1);
      await expect(b.page.getByRole('listitem').filter({ hasText: 'Tratamiento hidratante' })).toHaveCount(2);
      await expect(a.page.getByText(`Has entrado como ${emailA}`)).toBeVisible();
      await expect(a.page.getByText(emailB)).toHaveCount(0);
    } finally {
      await a.context.close();
      await b.context.close();
      await cleanup([emailA, emailB]);
    }
  });

  test('la respuesta es idéntica exista o no la cuenta', async ({ page }) => {
    const existing = newEmail();
    const fresh = newEmail();
    try {
      await signIn(page, existing); // crea la cuenta
      await page.getByRole('button', { name: 'Salir' }).click();
      await expect(page).toHaveURL(/\/acceso$/); // espera a que se cierre la sesión antes de seguir

      await requestLink(page, existing);
      const textExisting = await page.getByRole('status').innerText();
      await requestLink(page, fresh);
      const textFresh = await page.getByRole('status').innerText();
      expect(textExisting).toBe(textFresh);
    } finally {
      await cleanup([existing, fresh]);
    }
  });

  test('el enlace es de un solo uso y uno inventado se rechaza con el mismo mensaje', async ({ page, browser }) => {
    const email = newEmail();
    try {
      await requestLink(page, email);
      const path = await waitForLoginPath(email);

      await page.goto(path);
      await page.getByRole('button', { name: 'Entrar en mi cuenta' }).click();
      await expect(page).toHaveURL(/\/mis-citas$/);

      // Segunda vez, desde otro navegador sin sesión: ya está usado.
      const other = await freshPage(browser);
      try {
        await other.page.goto(path);
        await other.page.getByRole('button', { name: 'Entrar en mi cuenta' }).click();
        await expect(other.page.getByRole('heading', { name: 'Enlace no válido o caducado' })).toBeVisible();
        await expect(other.page.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeVisible();

        // Uno inventado con forma válida: el mismo resultado.
        await other.page.goto(`/acceso/confirmar?token_hash=${'A'.repeat(43)}`);
        await other.page.getByRole('button', { name: 'Entrar en mi cuenta' }).click();
        await expect(other.page.getByRole('heading', { name: 'Enlace no válido o caducado' })).toBeVisible();

        // Sin token o con forma imposible: ni siquiera se ofrece el botón.
        await other.page.goto('/acceso/confirmar?token_hash=%3Cscript%3E');
        await expect(other.page.getByRole('heading', { name: 'Enlace no válido o caducado' })).toBeVisible();
        await other.page.goto('/acceso/confirmar');
        await expect(other.page.getByRole('heading', { name: 'Enlace no válido o caducado' })).toBeVisible();
      } finally {
        await other.context.close();
      }
    } finally {
      await cleanup([email]);
    }
  });

  test('abrir el enlace (GET) no lo gasta: hace falta pulsar el botón', async ({ page, browser }) => {
    const email = newEmail();
    try {
      await requestLink(page, email);
      const path = await waitForLoginPath(email);

      // Un previsualizador que solo hace GET no consume el enlace.
      const response = await page.request.get(path);
      expect(response.status()).toBe(200);

      const other = await freshPage(browser);
      try {
        await other.page.goto(path);
        await other.page.getByRole('button', { name: 'Entrar en mi cuenta' }).click();
        await expect(other.page).toHaveURL(/\/mis-citas$/);
      } finally {
        await other.context.close();
      }
    } finally {
      await cleanup([email]);
    }
  });

  test('superado el cupo por email sigue la misma respuesta, pero no se envía otro enlace', async ({ page }) => {
    const email = newEmail();
    try {
      // Auth deja pasar un correo por dirección y segundo: se espacian las peticiones.
      for (let i = 0; i < 4; i++) {
        await requestLink(page, email);
        await page.waitForTimeout(1300);
      }
      await expect.poll(() => emailCountTo(email)).toBe(3);
      // Un instante más: confirma que el cuarto no llega tarde.
      await page.waitForTimeout(1000);
      expect(await emailCountTo(email)).toBe(3);
    } finally {
      await cleanup([email]);
    }
  });

  test('«mis citas» con sesión: sin violaciones graves de axe y sin desbordar de 320 a 1280 px', async ({ page }) => {
    // Con transiciones activas axe puede medir un color intermedio: se mide el final.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const email = newEmail();
    try {
      // Captura del acceso a 375 px para la review (solo si se pide: CAPTURE_EVIDENCE=1).
      if (process.env.CAPTURE_EVIDENCE) {
        await page.setViewportSize({ width: 375, height: 800 });
        await page.goto('/acceso');
        await page.screenshot({
          path: path.join('sdd', 'reviews', 'evidencias', 'T-007', 'acceso-375.png'),
          fullPage: true,
        });
      }
      await signIn(page, email);
      const userId = await userIdByEmail(email);
      await createAccountAppointment(userId ?? '', 30);
      await createAccountAppointment(userId ?? '', 31);
      await page.reload();
      await expect(page.getByRole('listitem').filter({ hasText: 'Tratamiento hidratante' })).toHaveCount(2);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

      for (const width of [320, 375, 480, 700, 768, 1024, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          return doc.scrollWidth - doc.clientWidth;
        });
        expect(overflow, `desborda ${overflow}px a ${width}px`).toBeLessThanOrEqual(1);
        const box = await page.locator('main').boundingBox();
        expect(box && box.x + box.width).toBeLessThanOrEqual(width + 1);
      }

      if (process.env.CAPTURE_EVIDENCE) {
        await page.setViewportSize({ width: 375, height: 800 });
        await page.screenshot({
          path: path.join('sdd', 'reviews', 'evidencias', 'T-007', 'mis-citas-375.png'),
          fullPage: true,
        });
      }
    } finally {
      await cleanup([email]);
    }
  });
});
