import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PUBLIC_PAGES } from '../src/lib/public-pages';
import { nextDay, pickDay, workday } from './helpers/booking-days';
import { submitForm } from './helpers/booking-flow';
import { madridInstant } from './integration/helpers/time';
import { createAppointmentWithToken, deleteAppointment } from './helpers/supabase-admin';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.describe('accesibilidad', () => {
  for (const route of PUBLIC_PAGES) {
    test(`${route}: sin violaciones graves ni críticas`, async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      if (serious.length > 0) {
        for (const v of serious) {
          console.error(`[a11y] ${v.id} (${v.impact}): ${v.help}`);
          for (const node of v.nodes.slice(0, 3)) {
            console.error(`  - ${node.target.join(' ')}`);
          }
        }
      }
      expect(serious, 'violaciones graves o críticas de axe').toEqual([]);
    });
  }

  test('/reservar con servicio, día y hora elegidos: sin violaciones graves', async ({ page }) => {
    // Con transiciones activas axe puede medir un botón a medio cambiar de color (contraste
    // intermedio). Con `reduced-motion` los tokens anulan las duraciones y se mide el color final.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/reservar');
    await page.getByLabel(/Balayage/).first().check({ force: true });
    await pickDay(page, workday()); // no depende de la hora actual
    await page.locator('button[data-starts-at]').first().click();
    await expect(page.getByRole('region', { name: 'Tu cita' })).toBeVisible();
    // Se envía el formulario vacío para que axe revise también los errores por campo.
    await submitForm(page);
    await expect(page.getByText('Escribe tu nombre')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    for (const v of serious) console.error(`[a11y] ${v.id} (${v.impact}): ${v.help}`);
    expect(serious, 'violaciones graves o críticas de axe').toEqual([]);
  });

  test('/cita/<token> válido: sin violaciones graves ni críticas', async ({ page }) => {
    const { id, token } = await createAppointmentWithToken();
    try {
      await page.goto(`/cita/${token}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Tu cita' })).toBeVisible();
      const check = async () => {
        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        const serious = results.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical',
        );
        for (const v of serious) console.error(`[a11y] ${v.id} (${v.impact}): ${v.help}`);
        expect(serious, 'violaciones graves o críticas de axe').toEqual([]);
      };
      await check();
      // T-006b: también con la confirmación de cancelación abierta.
      await page.getByRole('button', { name: 'Cancelar cita' }).click();
      await expect(page.getByRole('heading', { name: '¿Cancelar tu cita?' })).toBeVisible();
      await check();
    } finally {
      await deleteAppointment(id);
    }
  });

  test('/cita/<token>/cambiar con una hora elegida: sin violaciones graves ni críticas', async ({ page }, testInfo) => {
    // Con transiciones activas axe puede medir un botón a medio cambiar de color.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Día a 7 o más días y una hora propia por proyecto (16:00 / 17:00) para no chocar con otros e2e.
    const date = nextDay(7, (d) => d <= 5);
    const hour = testInfo.project.name === 'mobile' ? 17 : 16;
    const { id, token } = await createAppointmentWithToken({ startsAt: madridInstant(date, hour, 0) });
    try {
      await page.goto(`/cita/${token}/cambiar`);
      await expect(page.getByRole('heading', { level: 1, name: 'Cambiar tu cita' })).toBeVisible();
      await pickDay(page, date);
      await page.locator('button[data-starts-at]', { hasText: new RegExp(`^${hour}:30$`) }).click();
      await expect(page.getByRole('heading', { name: 'Tu cita nueva' })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      for (const v of serious) console.error(`[a11y] ${v.id} (${v.impact}): ${v.help}`);
      expect(serious, 'violaciones graves o críticas de axe').toEqual([]);
    } finally {
      await deleteAppointment(id);
    }
  });

  test('respeta prefers-reduced-motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    const hasInfiniteAnim = await page.evaluate(() => {
      const els = document.querySelectorAll('*');
      for (const el of els) {
        const style = getComputedStyle(el);
        if (style.animationIterationCount === 'infinite') return true;
      }
      return false;
    });
    expect(hasInfiniteAnim).toBe(false);
    await context.close();
  });
});
