import { test, expect } from '@playwright/test';

// T-027: el botón de la demo (con `DEMO_ENABLED=1`, fijado por playwright.config) cumple el suelo de accesibilidad
// táctil y de teclado en escritorio y en móvil. Sin base de datos: no abre sesión.
test.describe('demo del panel: botón (T-027)', () => {
  test('demo-boton: el botón es accesible con teclado y tiene área táctil de 44 px', async ({ page }) => {
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Probar el panel' });
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await button.focus();
    await expect(button).toBeFocused();
  });
});
