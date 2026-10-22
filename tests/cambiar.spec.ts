import { test, expect, type Page } from '@playwright/test';
import { daysBetween, todayInMadrid } from '../src/lib/booking/dates';
import { nextDay, pickDay } from './helpers/booking-days';
import { madridInstant } from './integration/helpers/time';
import {
  activeAppointmentsAt,
  adminClient,
  createAppointmentWithToken,
  deleteAppointment,
  moveAppointmentSoon,
} from './helpers/supabase-admin';

// T-006c: cambiar la cita desde su enlace (RF-05, CA-14 parte cambiar, ADR-0019).
// Cada proyecto usa su propio día laborable (el de móvil, el siguiente), a 7 o más días: los demás
// e2e usan días de 3 a 5 días vista. Dentro del día, cada test tiene su propia hora (HOUR), porque
// los tests corren en paralelo con la misma estilista. Original en H:00; destinos en H:15 (solapa con
// la propia cita) y H:30.
function dayFor(projectName: string): string {
  const first = nextDay(7, (d) => d <= 5);
  if (projectName !== 'mobile') return first;
  return nextDay(daysBetween(todayInMadrid(), first) + 1, (d) => d <= 5);
}

const HOUR = { mover: 10, solapa: 11, ocupado: 12, tarde: 13, cancelada: 14, responsive: 15 } as const;

const at = (date: string, hour: number, minute = 0) => madridInstant(date, hour, minute);
const CHANGE_LINK = /Cambiar cita/;

async function statusAndStart(id: string) {
  const { data } = await adminClient().from('appointments').select('status, during').eq('id', id).single();
  return data;
}

async function openChange(page: Page, token: string, date: string) {
  await page.goto(`/cita/${token}/cambiar`);
  await expect(page.getByRole('heading', { level: 1, name: 'Cambiar tu cita' })).toBeVisible();
  await pickDay(page, date);
}

const slotButton = (page: Page, time: string) =>
  page.locator('button[data-starts-at]', { hasText: new RegExp(`^${time}$`) });

// Espera a volver a la cita ya cambiada (el token no cambia).
const expectChanged = (page: Page, token: string) =>
  expect(page).toHaveURL(new RegExp(`/cita/${token}\\?cambiada=1$`));

test.describe('cambiar la cita desde el enlace', () => {
  test('CA-14: elegir otro hueco libre y confirmar mueve la misma cita y libera el antiguo', async ({
    page,
  }, testInfo) => {
    const date = dayFor(testInfo.project.name);
    const original = at(date, HOUR.mover, 0);
    const { id, token, stylistId } = await createAppointmentWithToken({ startsAt: original });
    try {
      await page.goto(`/cita/${token}`);
      await page.getByRole('link', { name: CHANGE_LINK }).click();
      await expect(page).toHaveURL(new RegExp(`/cita/${token}/cambiar$`));
      await expect(page.getByRole('heading', { level: 1, name: 'Cambiar tu cita' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Tu cita actual' })).toBeVisible();
      await pickDay(page, date);

      // La hora actual no se ofrece; un hueco que solapa con ella sí.
      await expect(slotButton(page, `${HOUR.mover}:15`)).toBeVisible();
      await expect(slotButton(page, `${HOUR.mover}:00`)).toHaveCount(0);

      await slotButton(page, `${HOUR.mover}:30`).click();
      await expect(page.getByRole('heading', { name: 'Tu cita nueva' })).toBeVisible();
      await page.getByRole('button', { name: 'Confirmar el cambio' }).click();

      // Vuelve a la cita con el mismo enlace y la hora nueva.
      await expectChanged(page, token);
      await expect(page.getByText('Hemos cambiado tu cita')).toBeVisible();
      await expect(page.locator('main').getByText(`${HOUR.mover}:30`, { exact: true })).toBeVisible();
      await expect(page.locator('main').getByText('Confirmada')).toBeVisible();

      const row = await statusAndStart(id);
      expect(row?.status).toBe('confirmed');
      expect(await activeAppointmentsAt(stylistId, original, 30)).toHaveLength(0);
      expect(await activeAppointmentsAt(stylistId, at(date, HOUR.mover, 30), 30)).toHaveLength(1);
    } finally {
      await deleteAppointment(id);
    }
  });

  test('CA-14: se puede mover a un hueco que solapa con la propia cita', async ({ page }, testInfo) => {
    const date = dayFor(testInfo.project.name);
    const { id, token } = await createAppointmentWithToken({ startsAt: at(date, HOUR.solapa, 0) });
    try {
      await openChange(page, token, date);
      await slotButton(page, `${HOUR.solapa}:15`).click();
      await page.getByRole('button', { name: 'Confirmar el cambio' }).click();
      await expectChanged(page, token);
      await expect(page.locator('main').getByText(`${HOUR.solapa}:15`, { exact: true })).toBeVisible();
    } finally {
      await deleteAppointment(id);
    }
  });

  test('si otra persona ocupa el hueco elegido antes de confirmar, se avisa y la cita no cambia', async ({
    page,
  }, testInfo) => {
    const date = dayFor(testInfo.project.name);
    const mine = await createAppointmentWithToken({ startsAt: at(date, HOUR.ocupado, 0) });
    let other: { id: string } | null = null;
    try {
      await openChange(page, mine.token, date);
      await slotButton(page, `${HOUR.ocupado}:30`).click();
      await expect(page.getByRole('heading', { name: 'Tu cita nueva' })).toBeVisible();

      other = await createAppointmentWithToken({ startsAt: at(date, HOUR.ocupado, 30) }); // otra persona reserva
      await page.getByRole('button', { name: 'Confirmar el cambio' }).click();

      await expect(page.getByText('Esa hora acaba de ocuparse', { exact: false }).first()).toBeVisible();
      await expect(page).toHaveURL(/\/cambiar$/);
      const row = await statusAndStart(mine.id);
      const originalStart = new Date(at(date, HOUR.ocupado, 0)).toISOString().slice(0, 16).replace('T', ' ');
      expect(row?.during).toContain(originalStart);
    } finally {
      await deleteAppointment(mine.id);
      if (other) await deleteAppointment(other.id);
    }
  });

  test('CA-14: con menos de 24 h no hay enlace de cambio y la ruta explica que hay que contactar', async ({
    page,
  }) => {
    const { id, token } = await createAppointmentWithToken({ soon: true });
    try {
      await page.goto(`/cita/${token}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Tu cita' })).toBeVisible();
      await expect(page.getByRole('link', { name: CHANGE_LINK })).toHaveCount(0);

      // Entrar a mano en la ruta tampoco permite cambiar.
      await page.goto(`/cita/${token}/cambiar`);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Ya no se puede cambiar desde aquí' }),
      ).toBeVisible();
      await expect(page.getByText('Contacta con el salón', { exact: false })).toBeVisible();
      await expect(page.locator('button[data-date]')).toHaveCount(0);
    } finally {
      await deleteAppointment(id);
    }
  });

  test('si la cita pasa a menos de 24 h con la página abierta, el servidor rechaza el cambio', async ({
    page,
  }, testInfo) => {
    const date = dayFor(testInfo.project.name);
    const { id, token } = await createAppointmentWithToken({ startsAt: at(date, HOUR.tarde, 0) });
    try {
      // CA-14: la página tiene los datos de ANTES de que la cita pasara a menos de 24 h y es el SERVIDOR quien
      // rechaza el cambio. Se bloquea el canal en tiempo real para que la página no se entere antes: con él, el
      // aviso de la BD recarga la disponibilidad, el servidor responde TOO_LATE y el botón «Confirmar el
      // cambio» desaparece a propósito (correcto en el producto). Sin bloquearlo, el test dependía de la
      // velocidad de la máquina: pasaba en local y fallaba en el runner de CI (T-013a). El CA no cambia.
      await page.routeWebSocket(/realtime/, (ws) => {
        void ws.close();
      });
      await openChange(page, token, date);
      await slotButton(page, `${HOUR.tarde}:30`).click();

      // Se acerca la cita después de cargar la página (entre 8 y 20 h: menos de 24 h).
      await moveAppointmentSoon(id);

      await page.getByRole('button', { name: 'Confirmar el cambio' }).click();
      await expect(page.getByText('Ya faltan menos de 24 horas', { exact: false })).toBeVisible();
      const row = await statusAndStart(id);
      expect(row?.status).toBe('confirmed');
      // No se movió al hueco pedido.
      const requested = new Date(at(date, HOUR.tarde, 30)).toISOString().slice(0, 16).replace('T', ' ');
      expect(row?.during).not.toContain(requested);
    } finally {
      await deleteAppointment(id);
    }
  });

  test('un enlace no válido o una cita cancelada no permiten cambiar', async ({ page }, testInfo) => {
    await page.goto(`/cita/${'A'.repeat(43)}/cambiar`);
    await expect(page.getByRole('heading', { level: 1, name: 'Enlace no válido o caducado' })).toBeVisible();
    await expect(page.locator('button[data-date]')).toHaveCount(0);

    const date = dayFor(testInfo.project.name);
    const { id, token } = await createAppointmentWithToken({ startsAt: at(date, HOUR.cancelada, 0) });
    try {
      await adminClient().from('appointments').update({ status: 'cancelled' }).eq('id', id);
      await page.goto(`/cita/${token}/cambiar`);
      await expect(page.getByRole('heading', { level: 1, name: 'Esta cita no se puede cambiar' })).toBeVisible();
    } finally {
      await deleteAppointment(id);
    }
  });

  test('la pantalla de cambio no desborda entre 320 y 1280 px', async ({ page }, testInfo) => {
    const date = dayFor(testInfo.project.name);
    const { id, token } = await createAppointmentWithToken({ startsAt: at(date, HOUR.responsive, 0) });
    try {
      for (const width of [320, 375, 480, 600, 768, 1024, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await openChange(page, token, date);
        await slotButton(page, `${HOUR.responsive}:30`).click();
        await expect(page.getByRole('heading', { name: 'Tu cita nueva' })).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `/cambiar a ${width}px`).toBeLessThanOrEqual(1);
      }
    } finally {
      await deleteAppointment(id);
    }
  });
});
