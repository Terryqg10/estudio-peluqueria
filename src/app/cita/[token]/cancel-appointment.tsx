'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CancelResult } from '@/lib/booking/cancel-appointment';
import { ROUTES } from '@/lib/routes';
import { cancelAppointmentAction } from './actions';

const BUTTON_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control px-6 font-semibold transition-colors duration-(--duration-fast) disabled:opacity-60';

const MESSAGES: Record<Exclude<CancelResult, { ok: true }>['error'], string> = {
  INVALID_LINK: 'Este enlace ya no es válido. Si necesitas ayuda con tu cita, contacta con el salón.',
  TOO_LATE: 'Ya faltan menos de 24 horas para tu cita y no se puede cancelar desde aquí. Contacta con el salón.',
  UNAVAILABLE: 'No hemos podido cancelar la cita. Inténtalo de nuevo en unos minutos.',
};

// Cancelación con confirmación en línea (RF-05, CA-13). El botón abre una confirmación; al
// confirmar se llama a la acción y se recarga la página para mostrar el estado real.
export function CancelAppointment({ token }: { token: string }) {
  const router = useRouter();
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<keyof typeof MESSAGES | null>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  function open() {
    setError(null);
    setConfirming(true);
    queueMicrotask(() => confirmRef.current?.focus());
  }

  function keep() {
    setConfirming(false);
    queueMicrotask(() => openRef.current?.focus());
  }

  async function confirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await cancelAppointmentAction(token);
      if (result.ok) {
        router.refresh();
        return;
      }
      setError(result.error);
      // Si ya no se puede cancelar, la confirmación no tiene sentido; la página se recarga con el estado real.
      if (result.error !== 'UNAVAILABLE') router.refresh();
    } catch {
      setError('UNAVAILABLE');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4">
      {error ? (
        <div role="alert" className="mb-4 rounded-card bg-accent-soft p-4 text-fg">
          <p>{MESSAGES[error]}</p>
          {error === 'TOO_LATE' || error === 'INVALID_LINK' ? (
            <Link
              href={ROUTES.contacto}
              className="mt-2 inline-flex min-h-11 items-center text-accent-text hover:underline"
            >
              Contacto
            </Link>
          ) : null}
        </div>
      ) : null}

      {confirming ? (
        <div role="group" aria-labelledby={titleId} className="rounded-card bg-surface p-6 shadow-card">
          <h2 id={titleId} className="font-display text-xl font-semibold">
            ¿Cancelar tu cita?
          </h2>
          <p className="mt-2 text-fg-muted">El hueco quedará libre y no podrás recuperarlo con este enlace.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={keep} disabled={pending} className={`${BUTTON_CLASS} text-accent-text hover:bg-accent-soft`}>
              No, mantener la cita
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={confirm}
              disabled={pending}
              className={`${BUTTON_CLASS} bg-accent text-accent-fg hover:bg-accent-hover`}
            >
              {pending ? 'Cancelando…' : 'Sí, cancelar la cita'}
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={openRef}
          type="button"
          onClick={open}
          className={`${BUTTON_CLASS} border border-border-strong text-fg hover:bg-accent-soft`}
        >
          Cancelar cita
        </button>
      )}
    </div>
  );
}
