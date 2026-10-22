import { randomUUID } from 'node:crypto';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { cleanup, confirmFromEmail, newEmail, requestLink, signIn } from './helpers/account-flow';
import { adminClient, setRole, userIdByEmail } from './helpers/supabase-admin';

// T-009a: gestión de servicios del Admin (CA-18). Cada test crea un servicio con nombre único y lo borra al
// terminar (con service_role, solo en el test).
const LIST = '/admin/servicios';

async function signInAsAdmin(page: Page, email: string) {
  await requestLink(page, email);
  const userId = await userIdByEmail(email);
  expect(userId).toBeTruthy();
  await setRole(userId ?? '', 'admin');
  await confirmFromEmail(page, email);
  await expect(page).toHaveURL(/\/admin$/);
}

const uniqueName = () => `Prueba e2e ${randomUUID().slice(0, 8)}`;

async function deleteServicesLike(prefix: string) {
  await adminClient().from('services').delete().ilike('name', `${prefix}%`);
}

async function fillService(page: Page, values: { name: string; category: string; price: string; duration: string }) {
  await page.getByLabel('Nombre').fill(values.name);
  await page.getByLabel('Categoría').fill(values.category);
  await page.getByLabel(/Precio/).fill(values.price);
  await page.getByLabel(/Duración/).fill(values.duration);
}

test.describe('gestión de servicios del Admin (CA-18)', () => {
  test('crear, editar y desactivar un servicio se refleja en la web pública', async ({ page }) => {
    const email = newEmail('admin');
    const name = uniqueName();
    try {
      await signInAsAdmin(page, email);

      // Crear: con estilista, aparece en la home y en la reserva.
      await page.goto(LIST);
      await page.getByRole('link', { name: 'Nuevo servicio' }).click();
      await fillService(page, { name, category: 'Pruebas e2e', price: '45,50', duration: '60' });
      await page.getByRole('checkbox', { name: 'Irene Solís' }).check();
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByRole('status')).toHaveText('Servicio guardado.');
      const row = page.locator('li[data-service-id]', { hasText: name });
      await expect(row).toContainText('Pruebas e2e');
      await expect(row).toContainText('Desde 45,50');
      await expect(row).toContainText('Activo');
      await expect(row).toContainText('Irene Solís');

      await page.goto('/');
      await expect(page.getByText(name)).toBeVisible();
      await page.goto('/reservar');
      await expect(page.getByText(name)).toBeVisible();

      // Editar: nuevo nombre y precio.
      const edited = `${name} editado`;
      await page.goto(LIST);
      await page.getByRole('link', { name: `Editar ${name}` }).click();
      await expect(page.getByLabel('Nombre')).toHaveValue(name);
      await page.getByLabel('Nombre').fill(edited);
      await page.getByLabel(/Precio/).fill('50');
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByRole('status')).toHaveText('Servicio guardado.');
      await expect(page.locator('li[data-service-id]', { hasText: edited })).toContainText('Desde 50');

      await page.goto('/');
      await expect(page.getByText(edited)).toBeVisible();
      await expect(page.getByText(name, { exact: true })).toHaveCount(0);

      // Desactivar: deja de ofrecerse en la web, pero sigue en el panel como inactivo.
      await page.goto(LIST);
      await page.getByRole('link', { name: `Editar ${edited}` }).click();
      await page.getByRole('checkbox', { name: /Activo/ }).uncheck();
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByRole('status')).toHaveText('Servicio guardado.');
      await expect(page.locator('li[data-service-id]', { hasText: edited })).toContainText('Inactivo');

      await page.goto('/');
      await expect(page.getByText(edited)).toHaveCount(0);
      await page.goto('/reservar');
      await expect(page.getByText(edited)).toHaveCount(0);
    } finally {
      await deleteServicesLike(name);
      await cleanup([email]);
    }
  });

  test('los errores de validación se explican y conservan lo escrito; un nombre repetido se rechaza', async ({ page }) => {
    const email = newEmail('admin');
    const name = uniqueName();
    try {
      await signInAsAdmin(page, email);
      await page.goto(`${LIST}/nuevo`);

      await fillService(page, { name: 'A', category: 'Pruebas e2e', price: 'gratis', duration: '62' });
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Revisa los datos' })).toBeVisible();
      await expect(page.getByText('Escribe un nombre de al menos 2 letras')).toBeVisible();
      await expect(page.getByText('Escribe un precio válido')).toBeVisible();
      await expect(page.getByText('de 5 a 480 minutos')).toBeVisible();
      await expect(page.getByLabel('Categoría')).toHaveValue('Pruebas e2e');
      await expect(page.getByLabel(/Precio/)).toHaveValue('gratis');

      // Nombre repetido (sin distinguir mayúsculas) con un servicio existente.
      await fillService(page, { name, category: 'Pruebas e2e', price: '30', duration: '30' });
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByRole('status')).toHaveText('Servicio guardado.');

      await page.goto(`${LIST}/nuevo`);
      await fillService(page, { name: name.toUpperCase(), category: 'Pruebas e2e', price: '30', duration: '30' });
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByText('Ya hay un servicio con ese nombre')).toBeVisible();
    } finally {
      await deleteServicesLike(name);
      await cleanup([email]);
    }
  });

  test('sin sesión lleva al acceso; una clienta recibe 404; un id no válido o inexistente también', async ({ page }) => {
    await page.goto(LIST);
    await expect(page).toHaveURL(/\/acceso$/);

    const clienta = newEmail('clienta');
    const admin = newEmail('admin');
    try {
      await signIn(page, clienta);
      expect((await page.goto(LIST))?.status()).toBe(404);
      expect((await page.goto(`${LIST}/nuevo`))?.status()).toBe(404);

      await page.context().clearCookies();
      await signInAsAdmin(page, admin);
      expect((await page.goto(`${LIST}/no-es-un-id`))?.status()).toBe(404);
      expect((await page.goto(`${LIST}/00000000-0000-0000-0000-000000000000`))?.status()).toBe(404);
    } finally {
      await cleanup([clienta, admin]);
    }
  });

  test('la lista y el formulario van con noindex, pasan axe y no desbordan de 320 a 1280 px', async ({ page }) => {
    test.setTimeout(90_000); // axe en muchos anchos: con todos los e2e en paralelo supera los 30 s por defecto
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const email = newEmail('admin');
    try {
      await signInAsAdmin(page, email);

      const response = await page.goto(LIST);
      expect(response?.headers()['cache-control']).toContain('no-store');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

      for (const route of [LIST, `${LIST}/nuevo`]) {
        await page.goto(route);
        for (const width of [320, 375, 480, 700, 768, 1024, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();
          expect(
            results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
            `axe en ${route} a ${width}px`,
          ).toEqual([]);
          const overflow = await page.evaluate(() => {
            const doc = document.documentElement;
            return doc.scrollWidth - doc.clientWidth;
          });
          expect(overflow, `${route} desborda ${overflow}px a ${width}px`).toBeLessThanOrEqual(1);
        }
      }

      if (process.env.CAPTURE_EVIDENCE) {
        await page.setViewportSize({ width: 375, height: 900 });
        await page.goto(LIST);
        await page.screenshot({ path: path.join('sdd', 'reviews', 'evidencias', 'T-009a', 'lista-375.png'), fullPage: true });
        await page.goto(`${LIST}/nuevo`);
        await page.screenshot({ path: path.join('sdd', 'reviews', 'evidencias', 'T-009a', 'formulario-375.png'), fullPage: true });
      }
    } finally {
      await cleanup([email]);
    }
  });
});
