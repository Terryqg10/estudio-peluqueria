import { test, expect } from '@playwright/test';
import { DEMO_EMAIL } from '../src/lib/demo/config';
import { adminClient, deleteAccount, userIdByEmail } from './helpers/supabase-admin';

// T-027 (ADR-0036, CA-48 parte de entrada): con `DEMO_ENABLED=1` (lo fija playwright.config) la home ofrece «Probar el
// panel» y un clic abre la sesión de la cuenta demo, sin email. La pantalla del panel en modo demo es T-028.
// Con la variable apagada no hay botón ni acción: lo cubren los tests unitarios (`demo-entrada`, `demo-accion`).
test.describe('demo del panel: entrada (T-027)', () => {
  test.afterAll(async () => {
    await deleteAccount(DEMO_EMAIL);
  });

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
});
