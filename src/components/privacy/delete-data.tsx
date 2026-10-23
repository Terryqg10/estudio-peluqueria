'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

type DeleteError = 'INVALID_LINK' | 'UNAUTHENTICATED' | 'NOT_ALLOWED' | 'INVALID_INPUT' | 'UNAVAILABLE';
export type DeleteActionResult = { ok: true } | { ok: false; error: DeleteError };

const BUTTON_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control px-6 font-semibold transition-colors duration-(--duration-fast) disabled:opacity-60';

const MESSAGES: Record<DeleteError, string> = {
  INVALID_LINK: 'Este enlace ya no es válido. Para borrar tus datos, contacta con el salón.',
  UNAUTHENTICATED: 'Tu sesión ha caducado. Entra de nuevo y vuelve a intentarlo.',
  NOT_ALLOWED: 'Esta cuenta no se puede borrar desde aquí.',
  INVALID_INPUT: 'No hemos podido procesar la petición. Recarga la página e inténtalo de nuevo.',
  UNAVAILABLE: 'No hemos podido borrar tus datos. Inténtalo de nuevo en unos minutos.',
};

const COPY = {
  guest: {
    open: 'Borrar mis datos',
    title: '¿Borrar tus datos?',
    body: 'Borraremos tu nombre, email y teléfono de esta cita y de las demás hechas con tu email. Las citas futuras se cancelarán y este enlace dejará de funcionar. No se puede deshacer.',
    confirm: 'Sí, borrar mis datos',
  },
  account: {
    open: 'Borrar mi cuenta y mis datos',
    title: '¿Borrar tu cuenta y tus datos?',
    body: 'Eliminaremos tu cuenta y tus datos personales. Tus citas futuras se cancelarán y las anteriores quedarán sin tu nombre ni tus datos de contacto. No se puede deshacer.',
    confirm: 'Sí, borrar mi cuenta',
  },
} as const;

// Borrado de datos con confirmación en línea (RF-09, CA-26). El botón abre la confirmación; al
// confirmar se llama a la acción de servidor y se navega a `doneHref`, que muestra el resultado.
export function DeleteData({
  kind,
  action,
  doneHref,
}: {
  kind: keyof typeof COPY;
  action: () => Promise<DeleteActionResult>;
  doneHref: string;
}) {
  const router = useRouter();
  const titleId = useId();
  const copy = COPY[kind];
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<DeleteError | null>(null);
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
      const result = await action();
      if (result.ok) {
        router.push(doneHref);
        return;
      }
      setError(result.error);
    } catch {
      setError('UNAVAILABLE');
    }
    setPending(false);
  }

  return (
    <div className="mt-4">
      {error ? (
        <div role="alert" className="mb-4 rounded-card bg-accent-soft p-4 text-fg">
          <p>{MESSAGES[error]}</p>
          {error === 'INVALID_LINK' ? (
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
            {copy.title}
          </h2>
          <p className="mt-2 text-fg-muted">{copy.body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={keep} disabled={pending} className={`${BUTTON_CLASS} text-accent-text hover:bg-accent-soft`}>
              No, conservar mis datos
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={confirm}
              disabled={pending}
              className={`${BUTTON_CLASS} bg-accent text-accent-fg hover:bg-accent-hover`}
            >
              {pending ? 'Borrando…' : copy.confirm}
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
          {copy.open}
        </button>
      )}
    </div>
  );
}
