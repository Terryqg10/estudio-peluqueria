import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addTimeBlock,
  anonClient,
  cleanup,
  createService,
  createStylist,
  daysFromNow,
  insertAppointment,
  service,
} from './helpers/db';

// ADR-0013 / CA-07 (solo infraestructura): al cambiar una cita o un bloqueo, la BD emite un
// broadcast público «availability» sin datos personales. La suscripción de la UI llega después.
type Message = { payload: Record<string, unknown> };

describe('tiempo-real (ADR-0013)', () => {
  const received: Message[] = [];
  const client = anonClient();
  let stylistId: string;
  let serviceId: string;

  beforeAll(async () => {
    stylistId = await createStylist();
    serviceId = await createService(60);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Realtime no llegó a SUBSCRIBED')), 10_000);
      client
        .channel('availability')
        .on('broadcast', { event: 'availability_changed' }, (message: Message) => {
          received.push(message);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timer);
            resolve();
          }
        });
    });
    // Tras SUBSCRIBED el servidor aún puede estar registrando la suscripción: sin esta espera
    // se pierde el primer mensaje. La UI no puede depender de ello (ver ADR-0013).
    await new Promise((r) => setTimeout(r, 1500));
  });

  afterAll(async () => {
    await client.removeAllChannels();
    await cleanup();
  });

  async function waitFor(predicate: (m: Message) => boolean, ms = 8000): Promise<Message> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const found = received.find(predicate);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('No llegó el mensaje de disponibilidad a tiempo');
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
