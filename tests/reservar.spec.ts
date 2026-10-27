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
    await expect(page.getByRole('group', { name: 'Carmen Ortega' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Elige día y hora' })).toHaveCount(0);
    await expect(page.getByText('Elige un servicio para ver las estilistas y los horarios.')).toBeVisible();

    await chooseService(page, 'Corte mujer');
    await expect(page.getByRole('heading', { name: 'Elige día y hora' })).toBeVisible();

    // T-042 (ADR-0040): la estilista se elige al pulsar su hora, en su fila de la jornada (ya no hay un paso separado).
    // Orden visual y de DOM: servicio → día y hora (con la fila de cada estilista).
    const stylistRow = page.getByRole('group', { name: 'Carmen Ortega' });
    await expect(stylistRow).toBeVisible();
    // Posición respecto al documento: el desplazamiento automático tras elegir servicio no la altera.
    const y = (locator: ReturnType<Page['locator']>) =>
      locator.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    const service = await y(page.getByRole('group', { name: 'Elige tu servicio' }));
    const day = await y(page.getByRole('heading', { name: 'Elige día y hora' }));
    const row = await y(stylistRow);
    expect(service).toBeLessThan(day);
    expect(day).toBeLessThan(row);
  });

  test('solo salen las filas de las estilistas del servicio y «Todas» es el filtro por defecto', async ({ page }) => {
    await page.goto('/reservar');
    await chooseService(page, 'Balayage'); // solo la hace Lucía
    await expect(page.getByRole('group', { name: 'Lucía Marín' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Irene Solís' })).toHaveCount(0);
    // Con una sola estilista no hace falta filtro.
    await expect(page.getByRole('group', { name: 'Estilista', exact: true })).toHaveCount(0);

    await page.goto('/reservar'); // la página se desplaza sola hasta el día al elegir servicio: se empieza de nuevo
    await chooseService(page, 'Corte mujer'); // la hacen varias
    const filter = page.getByRole('group', { name: 'Estilista', exact: true });
    await expect(filter).toBeVisible();
    await expect(filter.getByLabel('Todas')).toBeChecked();
    expect(await filter.getByRole('radio').count()).toBeGreaterThanOrEqual(3); // todas + al menos dos estilistas
  });

  test('CA-01: el botón «Reservar» de un servicio abre la reserva con ese servicio elegido', async ({ page }) => {
    await page.goto('/');
    await page.locator('#servicios').getByRole('link', { name: 'Reservar Corte mujer' }).click(); // la galería también tiene enlaces «Reservar …»
    await expect(page).toHaveURL(/\/reservar\?servicio=[0-9a-f-]{36}$/);
    await expect(page.getByLabel(/Corte mujer/).first()).toBeChecked();
    await expect(page.getByRole('heading', { name: 'Elige día y hora' })).toBeVisible();
  });

  test('un ?servicio= inválido se ignora', async ({ page }) => {
    await page.goto('/reservar?servicio=no-es-un-uuid');
    await expect(page.getByRole('heading', { level: 1, name: 'Reserva tu cita' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Elige día y hora' })).toHaveCount(0);
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
    await expect(summary).toContainText('Balayage');
    await expect(summary).toContainText('Lucía Marín');
    await expect(summary).toContainText(time);
    // La fecha larga no usa «capitalize» (daría «26 De Octubre»): solo la inicial va en mayúscula.
    const longDate = summary
      .getByText(/ de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i)
      .first();
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

  test('el selector muestra una semana (7 días) y las flechas llegan hasta la ventana de reserva (60 días)', async ({
    page,
  }) => {
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

  // T-042 (ADR-0040) sustituye a «tres columnas y mañana o tarde»: cada estilista tiene su fila con su regla horaria (decorativa)
  // y sus horas en orden, con botones de al menos 44 px.
  test('las horas van en la fila de su estilista, en orden y con área táctil de 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/reservar');
    await chooseService(page, 'Balayage');
    await pickDay(page, workday());

    const row = page.getByRole('group', { name: 'Lucía Marín' });
    await expect(row.locator('button[data-starts-at]').first()).toBeVisible();
    await expect(row.locator('.day-ruler')).toHaveCount(1);
    await expect(row.locator('.day-ruler').locator('xpath=..')).toHaveAttribute('aria-hidden', 'true');

    const starts = await row
      .locator('button[data-starts-at]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-starts-at') ?? ''));
    expect(starts.length).toBeGreaterThan(0);
    expect(starts).toEqual([...starts].sort());
    const box = await row.locator('button[data-starts-at]').first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
