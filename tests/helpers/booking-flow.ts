import { expect, type Page } from '@playwright/test';
import { pickDay, workday } from './booking-days';
import { idByName } from './supabase-admin';

// Pasos compartidos de la reserva en los e2e (T-005b y T-006a). Usa «Tratamiento hidratante»
// (30 min, solo Irene) y un día laborable futuro.
export async function startBooking(page: Page, time: string): Promise<string> {
  const serviceId = await idByName('services', 'Tratamiento hidratante');
  await page.goto(`/reservar?servicio=${serviceId}`);
  await pickDay(page, workday());
  const slot = page.locator('button[data-starts-at]', { hasText: new RegExp(`^${time}$`) });
  await expect(slot).toBeVisible();
  const startsAt = (await slot.getAttribute('data-starts-at')) ?? '';
  await slot.click();
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible();
  return startsAt;
}

// La disponibilidad se actualiza en vivo con las reservas de otros tests y puede re-renderizar el formulario justo al marcar
// (T-037): se reintenta hasta que la casilla queda marcada, en vez de fallar con «Clicking the checkbox did not change its state».
export async function acceptPrivacy(page: Page): Promise<void> {
  const box = page.getByRole('checkbox');
  await expect(async () => {
    await box.check({ timeout: 2_000 });
    await expect(box).toBeChecked({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

export async function fillForm(page: Page, email: string, over: { name?: string; phone?: string } = {}) {
  await page.getByLabel('Nombre', { exact: true }).fill(over.name ?? 'Ana García');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Teléfono', { exact: true }).fill(over.phone ?? '+34 600 000 000');
  await acceptPrivacy(page);
}

export const submit = (page: Page) => page.getByRole('button', { name: 'Confirmar reserva' });

// Envía el formulario con el teclado (Enter sobre el botón, que primero se enfoca): no depende de su
// posición en pantalla. La disponibilidad se actualiza en vivo y otros tests reservan a la vez en la
// misma estilista, así que el formulario puede desplazarse un instante y un clic por coordenadas
// caería fuera del botón (observado en WebKit móvil: ni error de validación ni «Reservando…»).
export async function submitForm(page: Page): Promise<void> {
  await submit(page).press('Enter');
}
