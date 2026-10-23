import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { cleanup, newEmail, signIn } from './helpers/account-flow';
import { createAccountAppointment, createAppointmentWithToken, deleteAppointment, userIdByEmail } from './helpers/supabase-admin';

// T-023: páginas estrechas en dos columnas, pie en tres columnas y enlaces alineados. Se mide con coordenadas:
// el título alineado con el logo (cabecera y pie comparten contenedor), la columna de apoyo a la derecha en
// escritorio y debajo del contenido en móvil, sin mitad vacía.
const A43 = 'A'.repeat(43);
const PAGES: [string, string][] = [
  ['acceso', '/acceso'],
  ['acceso-confirmar', `/acceso/confirmar?token_hash=${A43}`],
  ['borrar-datos', '/borrar-datos'],
  ['borrar-confirmar', `/borrar-datos/confirmar?token=${A43}`],
  ['borrar-enlace-invalido', '/borrar-datos/confirmar?error=enlace'],
  ['cita-invalida', `/cita/${A43}`],
  ['reserva-sin-cookie', '/reservar/confirmada'],
];

type Box = { x: number; y: number; width: number; height: number; right: number; bottom: number };
async function box(page: Page, selector: string): Promise<Box> {
  const b = await page.locator(selector).first().boundingBox();
  expect(b, `sin caja para ${selector}`).not.toBeNull();
  const { x, y, width, height } = b!;
  return { x, y, width, height, right: x + width, bottom: y + height };
}

// Borde izquierdo del TEXTO del primer enlace de la fila de enlaces bajo el contenido.
async function firstLinkTextLeft(page: Page): Promise<number> {
  return page.evaluate(() => {
    const link = document.querySelector<HTMLElement>('main a.rounded-control.text-accent-text:not([data-page-aside] *)');
    if (!link) return -1;
    const range = document.createRange();
    range.selectNodeContents(link);
    return range.getBoundingClientRect().left;
  });
}

async function expectTwoColumns(page: Page, label: string) {
  const h1 = await box(page, 'main h1');
  const logo = await box(page, 'header a[href="/"]');
  const aside = await box(page, '[data-page-aside]');
  const footerBrand = await box(page, 'footer p');

  // Contenedor compartido: el título empieza donde el logo y el nombre del pie (±2 px).
  expect(Math.abs(h1.x - logo.x), `${label}: título vs logo`).toBeLessThanOrEqual(2);
  expect(Math.abs(h1.x - footerBrand.x), `${label}: título vs pie`).toBeLessThanOrEqual(2);
  // La columna de apoyo está a la derecha, arriba junto al título y llega al borde derecho del contenedor.
  expect(aside.x, `${label}: aside a la derecha`).toBeGreaterThan(h1.x + 500);
  expect(Math.abs(aside.y - h1.y), `${label}: aside arriba`).toBeLessThanOrEqual(24);
  expect(aside.right, `${label}: aside llega al borde del contenedor`).toBeGreaterThan(1280 - 120);
  // El texto de los enlaces queda alineado con el título (no sangrado).
  const left = await firstLinkTextLeft(page);
  if (left >= 0) expect(Math.abs(left - h1.x), `${label}: enlaces alineados`).toBeLessThanOrEqual(1.5);
}

async function expectStacked(page: Page, label: string) {
  const h1 = await box(page, 'main h1');
  const aside = await box(page, '[data-page-aside]');
  const width = page.viewportSize()?.width ?? 375;
  expect(aside.y, `${label}: aside debajo del título`).toBeGreaterThan(h1.bottom);
  expect(Math.abs(aside.x - h1.x), `${label}: misma columna`).toBeLessThanOrEqual(2);
  expect(aside.right, `${label}: sin salirse`).toBeLessThanOrEqual(width);
  // DOM en orden de lectura: la columna de apoyo va DESPUÉS del contenido.
  const after = await page.evaluate(() => {
    const main = document.querySelector('main h1');
    const aside = document.querySelector('[data-page-aside]');
    return !!main && !!aside && !!(main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(after, `${label}: orden del DOM`).toBe(true);
}

test.describe('layout de páginas estrechas (T-023)', () => {
  for (const [label, path] of PAGES) {
    test(`1280 px: ${label} en dos columnas, alineada con la cabecera y el pie`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(path);
      await expectTwoColumns(page, label);
    });

    test(`375 px: ${label} apila la ayuda debajo del contenido`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(path);
      await expectStacked(page, label);
    });
  }

  test('la cita válida y «Mis citas» también usan las dos columnas', async ({ page }) => {
    const email = newEmail('layout');
    const { id, token } = await createAppointmentWithToken();
    let apptId = '';
    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/cita/${token}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Tu cita' })).toBeVisible();
      await expectTwoColumns(page, 'cita válida');

      await signIn(page, email);
      apptId = await createAccountAppointment((await userIdByEmail(email)) ?? '', 41);
      await page.goto('/mis-citas');
      await expect(page.getByRole('heading', { level: 1, name: 'Mis citas' })).toBeVisible();
      await expectTwoColumns(page, 'mis citas');

      await page.setViewportSize({ width: 375, height: 812 });
      await expectStacked(page, 'mis citas 375');
    } finally {
      await deleteAppointment(id);
      if (apptId) await deleteAppointment(apptId);
      await cleanup([email]);
    }
  });

  test('la columna de apoyo ofrece el teléfono, el horario y el contacto, sin violaciones graves de axe', async ({ page }) => {
    await page.goto('/acceso');
    const aside = page.locator('[data-page-aside]');
    await expect(aside.getByRole('heading', { name: '¿Necesitas ayuda?' })).toBeVisible();
    await expect(aside.getByRole('link', { name: '+34 600 000 000' })).toHaveAttribute('href', /^tel:/);
    await expect(aside.getByText('Lunes a viernes')).toBeVisible();
    await expect(aside.getByRole('link', { name: 'Ver todos los datos de contacto' })).toHaveAttribute('href', '/contacto');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
});

test.describe('pie de página en tres columnas (T-023)', () => {
  test('1280 px: marca y contacto, navegación con «Reservar» y «Tus datos» lado a lado', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/contacto');
    const footer = page.locator('footer');
    const brand = footer.getByText('Atelier Malva');
    const nav = footer.getByRole('navigation', { name: 'Pie de página' });
    const data = footer.getByRole('navigation', { name: 'Tus datos' });
    const [b, n, d] = await Promise.all([brand.boundingBox(), nav.boundingBox(), data.boundingBox()]);
    expect(b && n && d).toBeTruthy();
    expect(n!.x).toBeGreaterThan(b!.x + 200);
    expect(d!.x).toBeGreaterThan(n!.x + 200);
    // Alineadas arriba (misma fila).
    expect(Math.abs(n!.y - d!.y)).toBeLessThanOrEqual(2);

    await expect(nav.getByRole('link', { name: 'Reservar' })).toHaveAttribute('href', '/reservar');
    await expect(nav.getByRole('link', { name: 'Mis citas' })).toHaveAttribute('href', '/mis-citas');
    await expect(data.getByRole('link', { name: 'Borrar mis datos' })).toHaveAttribute('href', '/borrar-datos');
    await expect(footer.getByRole('link', { name: '+34 600 000 000' })).toHaveAttribute('href', /^tel:/);
  });

  test('375 px: se apila en una columna y los enlaces miden al menos 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/contacto');
    const footer = page.locator('footer');
    const nav = await footer.getByRole('navigation', { name: 'Pie de página' }).boundingBox();
    const data = await footer.getByRole('navigation', { name: 'Tus datos' }).boundingBox();
    expect(data!.y).toBeGreaterThan(nav!.y + nav!.height - 1);
    for (const link of await footer.getByRole('link').all()) {
      const b = await link.boundingBox();
      expect(b!.height).toBeGreaterThanOrEqual(43.5);
    }
  });
});
