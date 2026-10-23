'use client';

import { useActionState, useEffect, useId, useRef } from 'react';
import type { DeletionFormState } from '@/lib/privacy/schema';
import { requestGuestDeletionAction } from './actions';

const INPUT_CLASS =
  'min-h-11 w-full rounded-tile border border-border-strong bg-surface px-4 text-fg placeholder:text-fg-muted aria-invalid:border-danger';
const BUTTON_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover disabled:opacity-60';

const INITIAL: DeletionFormState = { status: 'idle', email: '' };

// Formulario de borrado por email (ADR-0032). Es un <form action>: el envío funciona aunque el
// JavaScript aún no haya cargado y el email nunca viaja en la URL. El mensaje de éxito es el mismo
// tenga o no citas ese email.
export function DeletionForm() {
  const formId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(requestGuestDeletionAction, INITIAL);

  const invalid = state.status === 'invalid';
  useEffect(() => {
    if (invalid) emailRef.current?.focus();
  }, [invalid, state]);

  const emailId = `${formId}-email`;
  const errorId = `${formId}-email-error`;

  return (
    <form action={formAction} noValidate className="mt-8 max-w-md space-y-5">
      {state.status === 'unavailable' ? (
        <div role="alert" className="rounded-card bg-accent-soft p-4 text-fg">
          <p>No hemos podido procesar la solicitud. Inténtalo de nuevo en unos minutos.</p>
        </div>
      ) : null}
      {state.status === 'sent' ? (
        <div role="status" className="rounded-card bg-accent-soft p-4 text-fg">
          <p>
            Si ese email tiene citas con nosotros, te hemos enviado un enlace para confirmar el borrado. Revisa tu
            bandeja de entrada y el correo no deseado. El enlace caduca en una hora.
          </p>
        </div>
      ) : null}

      <div>
        <label htmlFor={emailId} className="font-semibold">
          Email con el que reservaste
        </label>
        <input
          ref={emailRef}
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          defaultValue={state.email}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? errorId : undefined}
          className={`mt-1 ${INPUT_CLASS}`}
        />
        {state.status === 'invalid' ? (
          <p id={errorId} className="mt-1 text-danger">
            {state.message}
          </p>
        ) : null}
      </div>

      <button type="submit" disabled={pending} className={BUTTON_CLASS}>
        {pending ? 'Enviando…' : 'Enviarme el enlace de confirmación'}
      </button>
    </form>
  );
}
