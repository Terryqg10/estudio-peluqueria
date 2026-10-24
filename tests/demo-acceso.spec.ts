import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { mondayOf } from '../src/lib/admin/week';
import { DEMO_EMAIL } from '../src/lib/demo/config';
import {
  adminClient,
  createAppointmentWithToken,
  deleteAccount,
  deleteAppointment,
  userIdByEmail,
} from './helpers/supabase-admin';

// T-027 y T-028 (ADR-0036, CA-48): con `DEMO_ENABLED=1` (lo fija playwright.config) la home ofrece «Probar el panel»,
// un clic abre la sesión de la cuenta demo sin email y el panel se recorre en solo lectura, con los datos personales
// de visitantes enmascarados. Con la variable apagada no hay botón ni acción: lo cubren los tests unitarios
// (`demo-entrada`, `demo-accion`). La cuenta demo es única: las pruebas van en serie.
test.describe.configure({ mode: 'serial' });

test.describe('demo del panel (T-027, T-028)', () => {
  test.afterAll(async () => {
    await deleteAccount(DEMO_EMAIL);
  });

  async function enterPanel(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Probar el panel' }).click();
    await expect(page).toHaveURL(/\/admin$/);
  }

  test('demo-acceso: la home ofrece el botón y un clic abre la sesión de la cuenta demo', async ({ page, context }) => {
    await page.goto('/');
    const section = page.getByRole('region', { name: /prueba el panel/i });
    await expect(section).toBeVisible();
    await expect(section.getByRole('button', { name: 'Probar el panel' })).toBeVisible();

    await section.getByRole('button', { name: 'Probar el panel' }).click();
    await expect(page).toHaveURL(/\/admin$/);

    // La sesión es de la cuenta demo (cookie de Auth) y su rol en la BD es `demo`.
    const cookies = await context.cookies();
    expect(cookies.some((c) => c.name.includes('auth-token')), 'cookie de sesión').toBe(true);
    const id = await userIdByEmail(DEMO_EMAIL);
    expect(id).toBeTruthy();
    const profile = await adminClient().from('profiles').select('role').eq('id', id ?? '').single();
    expect(profile.data?.role).toBe('demo');
  });

  test('demo-panel: aviso de solo lectura, navegación completa y sin escritura posible', async ({ page }) => {
    await enterPanel(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Panel de administración' })).toBeVisible();
    await expect(page.getByText('Modo demo: solo lectura.')).toBeVisible();
    await expect(page.getByText('Has entrado con la cuenta de demostración.')).toBeVisible();
    await expect(page.getByText(DEMO_EMAIL)).toHaveCount(0);

    // Recorre todas las secciones: ninguna da 404 y todas llevan el aviso.
    for (const path of ['/admin/agenda', '/admin/servicios', '/admin/bloqueos', '/admin/horarios']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.getByText('Modo demo: solo lectura.'), path).toBeVisible();
    }

    // Servicios: sin «Nuevo servicio»; el formulario está desactivado y lo explica.
    await page.goto('/admin/servicios');
    await expect(page.getByRole('link', { name: 'Nuevo servicio' })).toHaveCount(0);
    await page.goto('/admin/servicios/nuevo');
    await expect(page.getByText('Desactivado en la demo: solo se puede mirar.')).toBeVisible();
    await expect(page.locator('fieldset[disabled] form button[type="submit"]')).toBeDisabled();

    // Bloqueos y horarios: formularios desactivados y sin «Quitar».
    await page.goto('/admin/bloqueos');
    await expect(page.getByRole('button', { name: /^Quitar/ })).toHaveCount(0);
    await expect(page.getByText('Desactivado en la demo: aquí el Admin añade bloqueos')).toBeVisible();
    await expect(page.getByRole('button', { name: /Añadir|Guardar|Crear/ })).toHaveCount(0);
    await page.goto('/admin/horarios');
    await expect(page.locator('fieldset[disabled] button[type="submit"]')).toBeDisabled();

    // Una acción de escritura que llegara al servidor vuelve al panel con el aviso, no con un 404.
    await page.goto('/admin?aviso=solo-lectura');
    await expect(page.getByRole('status').filter({ hasText: 'no se puede modificar nada' })).toBeVisible();
  });

  test('demo-panel: las citas de visitantes salen enmascaradas y la cita no se puede mover ni cancelar', async ({
    page,
  }) => {
    const appointment = await createAppointmentWithToken();
    try {
      await enterPanel(page);
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(appointment.startsAt));
      await page.goto(`/admin/agenda?semana=${mondayOf(day)}&dia=${day}`);
      const block = page.locator(`[data-view]:visible [data-appointment-id="${appointment.id}"]`);
      await expect(block).toContainText('Persona d.');
      const body = await page.locator('main').innerText();
      expect(body).not.toContain('Persona de prueba');
      expect(body).not.toContain('+34600000000');

      // La ficha de la cita no carga los huecos ni ofrece mover o cancelar.
      await page.goto(`/admin/agenda/cita/${appointment.id}`);
      await expect(page.getByText('En la demo no se pueden mover ni cancelar citas')).toBeVisible();
      await expect(page.getByRole('button', { name: /Guardar|Mover|Cancelar/ })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Cancelar la cita' })).toHaveCount(0);
      await expect(page.locator('main')).not.toContainText('Persona de prueba');
    } finally {
      await deleteAppointment(appointment.id);
    }
  });

  test('demo-pulido (T-033): chevron propio en los selects y la hora de cada cita cabe en una línea a 1280 px', async ({
    page,
  }) => {
    await enterPanel(page);
    await page.goto('/admin/horarios');
    const select = page.locator('select').first();
    await expect(select).toBeVisible();
    const { appearance, paddingRight } = await select.evaluate((el) => {
      const style = getComputedStyle(el);
      return { appearance: style.appearance, paddingRight: parseFloat(style.paddingRight) };
    });
    expect(appearance).toBe('none');
    expect(paddingRight).toBeGreaterThanOrEqual(40);
    await expect(select.locator('xpath=following-sibling::*[local-name()="svg"]')).toHaveCount(1);

    const appointment = await createAppointmentWithToken();
    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(appointment.startsAt));
      await page.goto(`/admin/agenda?semana=${mondayOf(day)}&dia=${day}`);
      const time = page.locator(`[data-view="week"] [data-appointment-id="${appointment.id}"] summary span`).first();
      await expect(time).toBeVisible();
      const box = await time.boundingBox();
      expect(box?.height ?? 99, 'la hora no se parte en dos líneas').toBeLessThan(26);
    } finally {
      await deleteAppointment(appointment.id);
    }
  });

  test('demo-panel: pasa axe y no desborda de 320 a 1280 px', async ({ page }) => {
    test.setTimeout(120_000);
    await enterPanel(page);
    for (const path of ['/admin', '/admin/agenda', '/admin/servicios/nuevo', '/admin/bloqueos', '/admin/horarios']) {
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
        ['resumen', '/admin'],
        ['agenda', '/admin/agenda'],
        ['servicio', '/admin/servicios/nuevo'],
        ['bloqueos', '/admin/bloqueos'],
      ] as const) {
        for (const width of [375, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(path);
          await page.screenshot({
            path: `sdd/reviews/evidencias/T-028/${name}-${width}.png`,
            fullPage: true,
          });
        }
      }
    }
  });
});
