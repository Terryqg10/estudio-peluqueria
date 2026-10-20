import { addTimeBlock, anonClient, daysFromNow, type Db } from './db';

// Escucha del canal público `availability` para los tests de tiempo real (ADR-0013, T-014).
//
// Por qué no basta `SUBSCRIBED` más una espera fija: tras `SUBSCRIBED` hay una ventana (~0,3 s medida
// en un arranque en frío) en la que el servidor aún registra la suscripción y los avisos se pierden, y
// en alguna pasada completa el canal llegó a no entregar nada durante más de 25 s. Aquí se SONDEA: se
// hace un cambio real sobre una estilista de sonda y no se empieza hasta recibir su aviso; si no
// llega, se vuelve a abrir la conexión (como hace la UI con su sondeo de respaldo) hasta 3 veces. Si
// aun así no llega, el error lleva el historial de estados del canal con su hora, para tener evidencia.

export type AvailabilityMessage = { payload: Record<string, unknown> };

const SUBSCRIBE_TIMEOUT_MS = 10_000;
const PROBE_ATTEMPT_MS = 4_000;
const PROBE_INTERVAL_MS = 300;
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class AvailabilityListener {
  readonly received: AvailabilityMessage[] = [];
  private readonly history: string[] = [];
  private readonly startedAt = Date.now();
  private client: Db | null = null;
  private probes = 0;

  // `probeStylistId`: una estilista que solo usa la sonda, para no confundirla con los avisos de los tests.
  constructor(private readonly probeStylistId: string) {}

  private note(what: string): void {
    this.history.push(`+${String(Date.now() - this.startedAt).padStart(6)} ms  ${what}`);
  }

  // Resumen para los mensajes de error: historial del canal y recuento de avisos recibidos.
  report(): string {
    const fromProbe = this.received.filter((m) => m.payload.stylist_id === this.probeStylistId).length;
    return [
      `Mensajes recibidos: ${this.received.length} (de la sonda: ${fromProbe})`,
      ...this.history,
    ].join('\n');
  }

  private async connect(): Promise<void> {
    await this.close();
    const client = anonClient();
    this.client = client;
    this.note('conectando');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`sin SUBSCRIBED en ${SUBSCRIBE_TIMEOUT_MS} ms`)),
        SUBSCRIBE_TIMEOUT_MS,
      );
      client
        .channel('availability')
        .on('broadcast', { event: 'availability_changed' }, (message: AvailabilityMessage) => {
          this.received.push(message);
        })
        .subscribe((status, error) => {
          this.note(`estado ${status}${error ? `: ${error.message}` : ''}`);
          if (status === 'SUBSCRIBED') {
            clearTimeout(timer);
            resolve();
          }
        });
    });
  }

  // Cambia algo de la estilista de sonda cada ~300 ms hasta que llegue su aviso (o se agote el intento).
  private async probeUntilDelivered(): Promise<boolean> {
    const from = this.received.length;
    const end = Date.now() + PROBE_ATTEMPT_MS;
    while (Date.now() < end) {
      // Un día distinto cada vez: cada sonda es un cambio real y distinto.
      await addTimeBlock(this.probeStylistId, daysFromNow(200 + this.probes++, 9), 15);
      const next = Date.now() + PROBE_INTERVAL_MS;
      while (Date.now() < next) {
        const delivered = this.received
          .slice(from)
          .some((m) => m.payload.stylist_id === this.probeStylistId);
        if (delivered) return true;
        await sleep(25);
      }
    }
    return false;
  }

  // Garantiza que el canal ENTREGA avisos ahora mismo. Se llama antes de cada test: así un canal que
  // se haya quedado mudo se detecta (y se recupera) aquí y no como un «no llegó a tiempo» del test.
  async ensureDelivering(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        if (!this.client || attempt > 1) await this.connect();
        if (await this.probeUntilDelivered()) {
          this.note(`entrega confirmada (intento ${attempt})`);
          return;
        }
        this.note(`intento ${attempt}: la sonda no llegó en ${PROBE_ATTEMPT_MS} ms`);
      } catch (error) {
        this.note(`intento ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw new Error(`Realtime no entrega avisos tras ${MAX_ATTEMPTS} intentos.\n${this.report()}`);
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (client) await client.removeAllChannels();
  }
}
