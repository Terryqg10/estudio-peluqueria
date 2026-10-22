import { test, expect, type Page } from '@playwright/test';
import { pickDay, sunday, workday } from './helpers/booking-days';

// T-005a: selección de hueco en /reservar (CA-05, CA-07, CA-01).

async function chooseService(page: Page, name: string) {
  await page.getByLabel(new RegExp(name)).first().check({ force: true });
}

test.describe('reservar: orden y preselección', () => {
  test('CA-05: el primer paso es elegir servicio; estilista, día y hora vienen después', async ({ page }) => {
    await page.goto('/reservar');
    await expect(page.getByRole('heading', { level: 1, name: 'Reserva tu cita' })).toBeVisible();

    // Antes de elegir servicio solo existe el primer paso.
    await expect(page.getByRole('group', { name: 'Elige tu servicio' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Elige estilista' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Elige día y hora' })).toHaveCount(0);
    await expect(page.getByText('Elige un servicio para ver las estilistas y los horarios.')).toBeVisible();

    await chooseService(page, 'Corte mujer');
    await expect(page.getByRole('group', { name: 'Elige estilista' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Elige día y hora' })).toBeVisible();

    // Orden visual y de DOM: servicio → estilista → día.
    const y = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())?.y ?? -1;
    const service = await y(page.getByRole('group', { name: 'Elige tu servicio' }));
    const stylist = await y(page.getByRole('group', { name: 'Elige estilista' }));
    const day = await y(page.getByRole('heading', { name: 'Elige día y hora' }));
    expect(service).toBeLessThan(stylist);
    expect(stylist).toBeLessThan(day);
  });

  test('«Cualquiera disponible» es la opción por defecto y solo salen las estilistas del servicio', async ({
    page,
  }) => {
    await page.goto('/reservar');
    await chooseService(page, 'Balayage'); // solo la hace Lucía
    await expect(page.getByLabel(/Cualquiera disponible/)).toBeChecked();
    const stylists = page.getByRole('group', { name: 'Elige estilista' });
    await expect(stylists.getByRole('radio')).toHaveCount(2); // cualquiera + Lucía
    await expect(stylists.getByText('Lucía Marín')).toBeVisible();
    await expect(stylists.getByText('Irene Solís')).toHaveCount(0);
  });

  test('CA-01: el botón «Reservar» de un servicio abre la reserva con ese servicio elegido', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Reservar Corte mujer' }).click();
    await expect(page).toHaveURL(/\/reservar\?servicio=[0-9a-f-]{36}$/);
    await expect(page.getByLabel(/Corte mujer/).first()).toBeChecked();
    await expect(page.getByRole('group', { name: 'Elige estilista' })).toBeVisible();
  });

  test('un ?servicio= inválido se ignora', async ({ page }) => {
    await page.goto('/reservar?servicio=no-es-un-uuid');
    await expect(page.getByRole('heading', { level: 1, name: 'Reserva tu cita' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Elige estilista' })).toHaveCount(0);
  });

  test('IMP-01: el botón «Reservar» de la cabecera es visible a 390 px y tras hacer scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const cta = page.locator('header').getByRole('link', { name: 'Reservar', exact: true });
    await expect(cta).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 2000));
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/reservar$/);
  });
});

test.describe('reservar: huecos', () => {
  test('al elegir una hora aparece el resumen con servicio, estilista, día y hora', async ({ page }) => {
    await page.goto('/reservar');
    await chooseService(page, 'Balayage');
    const date = workday();
    await pickDay(page, date);

    const first = page.locator('button[data-starts-at]').first();
    await expect(first).toBeVisible();
    const time = (await first.textContent())?.trim() ?? '';
    await first.click();

    const summary = page.getByRole('region', { name: 'Tu cita' });
    await expect(summary).toBeVisible();
    await expect(summary.getByText('Balayage')).toBeVisible();
    await expect(summary.getByText('Lucía Marín')).toBeVisible();
    await expect(summary.getByText(time, { exact: true })).toBeVisible();
    // La fecha larga no usa «capitalize» (daría «26 De Octubre»): solo la inicial va en mayúscula.
    const longDate = summary.getByText(/ de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i).first();
    await expect(longDate).not.toHaveCSS('text-transform', 'capitalize');
    await expect(first).toHaveAttribute('aria-pressed', 'true');
  });

  test('un día cerrado propone los próximos con disponibilidad', async ({ page }) => {
    await page.goto('/reservar');
    await chooseService(page, 'Balayage');
    await pickDay(page, sunday());

    await expect(page.getByText('No quedan horas libres este día.')).toBeVisible();
    const suggestion = page.getByText('Próximos días con disponibilidad:');
    await expect(suggestion).toBeVisible();
    const buttons = suggestion.locator('xpath=following-sibling::ul//button');
    expect(await buttons.count()).toBeGreaterThan(0);

    await buttons.first().click();
    await expect(page.locator('button[data-starts-at]').first()).toBeVisible();
  });

  test('el selector muestra una semana (7 días) y las flechas llegan hasta la ventana de reserva (60 días)', async ({ page }) => {
    await page.goto('/reservar');
    await chooseService(page, 'Corte mujer');
    const days = page.locator('button[data-date]');
    const prev = page.getByRole('button', { name: 'Semana anterior' });
    const next = page.getByRole('button', { name: 'Semana siguiente' });

    await expect(days).toHaveCount(7);
    await expect(prev).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Más fechas' })).toHaveCount(0);

    // 60 días = 8 semanas completas + una última de 4 días.
    let seen = 7;
    for (let i = 0; i < 8; i++) {
      await next.click();
      seen += await days.count();
    }
    expect(seen).toBe(60);
    await expect(next).toBeDisabled();
    await expect(days).toHaveCount(4);

    await prev.click();
    await expect(days).toHaveCount(7);
  });

  test('las horas van en tres columnas y agrupadas en mañana o tarde', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/reservar');
    await chooseService(page, 'Balayage');
    await pickDay(page, workday());
    await expect(page.locator('button[data-starts-at]').first()).toBeVisible();

    const columns = await page
      .locator('button[data-starts-at]')
      .first()
      .evaluate((el) => getComputedStyle(el.closest('ul') as HTMLElement).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(3);
    // Otros tests ocupan huecos de ese día: se exige al menos un grupo, no los dos.
    await expect(page.getByRole('heading', { name: /^(Mañana|Tarde)$/ }).first()).toBeVisible();
  });
});
