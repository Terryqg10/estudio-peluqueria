import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { startBooking } from './helpers/booking-flow';

// T-030 (ADR-0038, CA-52, CA-53): páginas de demostración y privacidad, enlaces del pie y avisos de datos ficticios.
const PAGES = [
  { path: '/aviso-legal', h1: 'Aviso de demostración' },
  { path: '/privacidad', h1: 'Privacidad' },
];

test.describe('legales de la demo (T-030)', () => {
  test('legales-demo (CA-52): el pie enlaza las dos páginas y dice que es un proyecto de portfolio', async ({ page }) => {
    for (const route of ['/', '/contacto', '/reservar']) {
      await page.goto(route);
      const footer = page.locator('footer');
      await expect(footer.getByText('Proyecto de portfolio', { exact: false })).toBeVisible();
      for (const { path, h1 } of PAGES) {
        const link = footer.getByRole('link', { name: h1 === 'Privacidad' ? 'Privacidad' : 'Aviso de demostración' });
        await expect(link, `${route} → ${path}`).toHaveAttribute('href', path);
      }
    }

    await page.goto('/');
    for (const { path, h1 } of PAGES) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
      // Sin enlaces vacíos ni a «#».
      const hrefs = await page.locator('main a').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
      for (const href of hrefs) expect(href && href !== '#', `${path}: ${href}`).toBeTruthy();
    }
  });

  test('legales-demo (CA-52): privacidad cuenta qué se guarda y enlaza el borrado; el aviso enlaza portfolio y código', async ({
    page,
  }) => {
    await page.goto('/privacidad');
    await expect(page.getByText('Usa datos ficticios.')).toBeVisible();
    for (const text of ['Supabase', 'Vercel', 'Resend', 'Cookies', 'No hay cookies de analítica ni de terceros']) {
      await expect(page.getByText(text, { exact: false }).filter({ visible: true }).first()).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Borrar mis datos' }).first()).toHaveAttribute('href', '/borrar-datos');

    await page.goto('/aviso-legal');
    await expect(page.getByRole('link', { name: 'terryq.com' })).toHaveAttribute('href', 'https://terryq.com/');
    await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', /github\.com\/Terryqg10\/estudio-peluqueria/);
    await expect(page.locator('main').getByText('No se atiende ninguna cita')).toBeVisible();
  });

  test('legales-demo (CA-52): las dos páginas pasan axe y no desbordan de 320 a 1280 px', async ({ page }) => {
    test.setTimeout(90_000);
    for (const { path } of PAGES) {
      for (const width of [320, 375, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(
          results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
          `axe en ${path} a ${width}px`,
        ).toEqual([]);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `desborda ${overflow}px en ${path} a ${width}px`).toBeLessThanOrEqual(1);
      }
    }

    if (process.env.CAPTURE_EVIDENCE) {
      for (const [name, path] of [
        ['aviso', '/aviso-legal'],
        ['privacidad', '/privacidad'],
        ['reservar', '/reservar'],
        ['acceso', '/acceso'],
      ] as const) {
        for (const width of [375, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(path);
          await page.screenshot({ path: `sdd/reviews/evidencias/T-030/${name}-${width}.png`, fullPage: true });
        }
      }
    }
  });

  test('legales-demo (CA-53): reservar, acceso y borrar datos avisan de que es una demo y piden datos ficticios', async ({
    page,
  }) => {
    for (const route of ['/reservar', '/acceso', '/borrar-datos']) {
      await page.goto(route);
      const notice = page.locator('[data-demo-notice]');
      await expect(notice, route).toBeVisible();
      await expect(notice).toContainText('Es una demo');
      await expect(notice).toContainText('usa datos ficticios');
      await expect(notice.getByRole('link', { name: 'Qué guarda esta demo' })).toHaveAttribute('href', '/privacidad');
    }
  });

  test('legales-demo (CA-53): el formulario de reserva enlaza la privacidad junto al consentimiento sin cambiar su texto', async ({
    page,
  }) => {
    await startBooking(page, '18:30') // no crea cita;
    const consent = page.getByRole('checkbox');
    await expect(consent).toBeVisible();
    await expect(page.getByText('Acepto que el salón guarde mi nombre, email y teléfono para gestionar esta cita.')).toBeVisible();
    await expect(page.getByText('Es una demo: usa datos ficticios.')).toBeVisible();
    await expect(page.locator('form').getByRole('link', { name: 'Qué guarda esta demo' })).toHaveAttribute(
      'href',
      '/privacidad',
    );
  });
});
