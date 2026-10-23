import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { cleanup, confirmFromEmail, newEmail, requestLink } from './helpers/account-flow';
import { setRole, userIdByEmail } from './helpers/supabase-admin';
import { MENU_OPTIONS } from '../src/lib/chatbot/tree';

// T-010: chat de reglas (RF-08, CA-21 a CA-24). El enlace de WhatsApp (CA-23) y el árbol se prueban también como
// componente (`tests/unit/chatbot.test.tsx`); aquí, el comportamiento en el navegador real.
const FAB = { name: 'Abrir chat de ayuda' };

const fab = (page: Page) => page.getByRole('button', FAB);
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Chat de ayuda' });

test.describe('chat de ayuda', () => {
  test('chat-abrir (CA-21): el botón está abajo a la derecha, dentro del viewport y sin tapar el pie, de 320 a 1280 px', async ({
    page,
  }) => {
    for (const route of ['/', '/contacto', '/reservar']) {
      await page.goto(route);
      for (const width of [320, 375, 480, 700, 768, 1024, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        const button = fab(page);
        await expect(button).toBeVisible();
        const box = await button.boundingBox();
        expect(box, `${route} ${width}`).not.toBeNull();
        if (!box) continue;
        // Esquina inferior derecha, dentro de la ventana y con área táctil de al menos 44×44 px.
        expect(box.x + box.width, `${route} ${width}: derecha`).toBeLessThanOrEqual(width);
        expect(box.y + box.height, `${route} ${width}: abajo`).toBeLessThanOrEqual(800);
        expect(box.x, `${route} ${width}: a la derecha`).toBeGreaterThan(width / 2);
        expect(box.y, `${route} ${width}: abajo`).toBeGreaterThan(400);
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }

    // Al final de la página no tapa el contenido del pie.
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const overlaps = await page.evaluate(() => {
      const button = document.querySelector('button[aria-label="Abrir chat de ayuda"]');
      if (!button) return ['sin botón'];
      const b = button.getBoundingClientRect();
      return Array.from(document.querySelectorAll('footer a, footer p'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
        })
        .map((el) => el.textContent ?? '');
    });
    expect(overlaps).toEqual([]);

    // Abre un diálogo.
    await fab(page).click();
    await expect(dialog(page)).toBeVisible();
  });

  test('chat-pie (T-025): al final de la página el botón queda encima del pie, de 320 a 1280 px', async ({ page }) => {
    for (const width of [320, 375, 700, 1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      // Fuera del final, el botón está a 16 px del borde inferior.
      const top = await fab(page).boundingBox();
      expect(top, `${width}: arriba`).not.toBeNull();
      if (top) expect(800 - (top.y + top.height), `${width}: arriba`).toBeCloseTo(16, 0);

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect
        .poll(
          async () => {
            const button = await fab(page).boundingBox();
            const footer = await page.locator('footer').boundingBox();
            return button && footer ? footer.y - (button.y + button.height) : null;
          },
          { message: `${width}: el botón debe quedar sobre el pie` },
        )
        .toBeGreaterThanOrEqual(-0.5);
    }
  });

  test('chat-arbol (CA-22): cada opción da su respuesta y siempre hay «Volver al menú»', async ({ page }) => {
    await page.goto('/');
    await fab(page).click();
    const chat = dialog(page);

    for (const option of MENU_OPTIONS) {
      await chat.getByRole('button', { name: option.option }).click();
      const reply = chat.locator(`[data-node="${option.id}"]`);
      await expect(reply).toBeVisible();
      for (const paragraph of option.reply) await expect(reply).toContainText(paragraph);
      await expect(reply).toBeFocused();
      await chat.getByRole('button', { name: 'Volver al menú' }).click();
      await expect(chat.locator('[data-node="menu"]')).toBeVisible();
    }

    // «Hablar con un humano»: enlace wa.me válido en pestaña nueva y seguro (se comprueba sin abrirlo).
    await chat.getByRole('button', { name: 'Hablar con un humano' }).click();
    const whatsapp = chat.getByRole('link', { name: 'Abrir WhatsApp' });
    await expect(whatsapp).toHaveAttribute('target', '_blank');
    await expect(whatsapp).toHaveAttribute('rel', 'noopener noreferrer');
    const href = (await whatsapp.getAttribute('href')) ?? '';
    expect(new URL(href).host).toBe('wa.me');
    expect(new URL(href).pathname).toMatch(/^\/[1-9]\d{7,14}$/);
  });

  test('«Ver precios» lleva a los servicios de la página de inicio y cierra el chat', async ({ page }) => {
    await page.goto('/contacto');
    await fab(page).click();
    await dialog(page).getByRole('button', { name: 'Ver precios' }).click();
    await dialog(page).getByRole('link', { name: 'Ver servicios y precios' }).click();
    await expect(page).toHaveURL(/\/#servicios$/);
    await expect(dialog(page)).toBeHidden();
    await expect(page.locator('#servicios')).toBeVisible();
  });

  test('chat-a11y (CA-24): Esc, el botón de cerrar y el clic fuera cierran y devuelven el foco al botón', async ({
    page,
  }) => {
    await page.goto('/');
    const chat = dialog(page);

    await fab(page).click();
    await expect(chat).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(chat).toBeHidden();
    await expect(fab(page)).toBeFocused();

    await fab(page).click();
    await chat.getByRole('button', { name: 'Cerrar el chat' }).click();
    await expect(chat).toBeHidden();
    await expect(fab(page)).toBeFocused();

    await fab(page).click();
    await page.mouse.click(5, 5); // fuera del diálogo (el fondo)
    await expect(chat).toBeHidden();
    await expect(fab(page)).toBeFocused();

    // El foco no sale del diálogo con Tab (diálogo modal).
    await fab(page).click();
    for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true);
  });

  test('chat-a11y: sin almacenamiento, sin cookies nuevas y sin peticiones a otros orígenes; pasa axe abierto', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const origin = new URL(page.url()).origin;

    const cookiesBefore = await page.context().cookies();
    const storageBefore = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));

    const requests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith('data:') && !url.startsWith(origin)) requests.push(url);
    });

    await fab(page).click();
    const chat = dialog(page);
    for (const option of MENU_OPTIONS) {
      await chat.getByRole('button', { name: option.option }).click();
      await chat.getByRole('button', { name: 'Volver al menú' }).click();
    }

    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const results = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'), `axe a ${width}px`).toEqual([]);
    }

    await page.keyboard.press('Escape');
    expect(requests).toEqual([]);
    expect(await page.context().cookies()).toEqual(cookiesBefore);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual(storageBefore);
  });

  test('no aparece en el panel de administración', async ({ page }) => {
    const email = newEmail('admin');
    try {
      await requestLink(page, email);
      const userId = await userIdByEmail(email);
      expect(userId).toBeTruthy();
      await setRole(userId ?? '', 'admin');
      await confirmFromEmail(page, email);
      await expect(page).toHaveURL(/\/admin$/);

      await expect(fab(page)).toHaveCount(0);
      await page.goto('/admin/agenda');
      await expect(fab(page)).toHaveCount(0);

      await page.goto('/');
      await expect(fab(page)).toBeVisible();
    } finally {
      await cleanup([email]);
    }
  });
});
