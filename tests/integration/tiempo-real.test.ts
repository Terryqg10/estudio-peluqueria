import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addTimeBlock,
  cleanup,
  createService,
  createStylist,
  daysFromNow,
  insertAppointment,
  service,
} from './helpers/db';
import { AvailabilityListener, type AvailabilityMessage as Message } from './helpers/realtime';

// ADR-0013 / CA-07 (solo infraestructura): al cambiar una cita o un bloqueo, la BD emite un
// broadcast público «availability» sin datos personales. La suscripción de la UI llega después.
// T-014: antes de cada test se confirma con una sonda que el canal entrega (ver helpers/realtime.ts).
describe('tiempo-real (ADR-0013)', () => {
  let listener: AvailabilityListener;
  let stylistId: string;
  let serviceId: string;

  beforeAll(async () => {
    stylistId = await createStylist();
    serviceId = await createService(60);
    listener = new AvailabilityListener(await createStylist('Sonda de tiempo real'));
    await listener.ensureDelivering();
  }, 90_000);

  beforeEach(async () => {
    await listener.ensureDelivering();
  }, 90_000);

  afterAll(async () => {
    await listener.close();
    await cleanup();
  });

  async function waitFor(predicate: (m: Message) => boolean, ms = 8000): Promise<Message> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const found = listener.received.find(predicate);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 100));
    }
    // Con el historial del canal: si vuelve a fallar, queda evidencia de qué pasó y cuándo.
    throw new Error(`No llegó el mensaje de disponibilidad a tiempo\n${listener.report()}`);
  }

  it('al crear una cita se emite un aviso con la estilista y la franja, sin datos personales', async () => {
    const start = daysFromNow(40, 10);
    const created = await insertAppointment({ stylistId, serviceId, start });

    const message = await waitFor(
      (m) => m.payload.stylist_id === stylistId && m.payload.op === 'INSERT',
    );
    expect(new Date(String(message.payload.starts_at)).getTime()).toBe(start.getTime());
    // `id` lo añade Realtime (id del mensaje); el resto es lo que emite el trigger.
    expect(Object.keys(message.payload).sort()).toEqual([
      'ends_at',
      'id',
      'op',
      'starts_at',
      'stylist_id',
    ]);
    // El `id` no puede ser el de la cita: no debe permitir identificar ni consultar nada.
    expect(message.payload.id).not.toBe(created.data?.id);
    expect(JSON.stringify(message.payload)).not.toContain(created.data?.id ?? 'sin-id');
    expect(JSON.stringify(message.payload)).not.toMatch(/invitada|@|\+34/);
  });

  it('al cancelar la cita se emite otro aviso (el hueco vuelve a estar libre)', async () => {
    const start = daysFromNow(41, 10);
    const created = await insertAppointment({ stylistId, serviceId, start });
    await service.from('appointments').update({ status: 'cancelled' }).eq('id', created.data?.id ?? '');

    const message = await waitFor(
      (m) =>
        m.payload.stylist_id === stylistId &&
        m.payload.op === 'UPDATE' &&
        new Date(String(m.payload.starts_at)).getTime() === start.getTime(),
    );
    expect(message.payload.op).toBe('UPDATE');
  });

  it('al crear un bloqueo se emite un aviso', async () => {
    const start = daysFromNow(42, 14);
    await addTimeBlock(stylistId, start, 120);
    const message = await waitFor(
      (m) =>
        m.payload.stylist_id === stylistId &&
        new Date(String(m.payload.starts_at)).getTime() === start.getTime(),
    );
    expect(message.payload.op).toBe('INSERT');
  });
});
