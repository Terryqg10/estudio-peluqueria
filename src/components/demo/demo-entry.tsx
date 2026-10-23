'use client';

import { useActionState } from 'react';
import { enterDemoAction, type DemoEntryState } from '@/app/demo/actions';

const MESSAGES = {
  limit: 'Has entrado muchas veces seguidas. Vuelve a intentarlo dentro de un rato.',
  unavailable: 'Ahora mismo no podemos abrir la demo. Inténtalo de nuevo en unos minutos.',
} as const;

// Botón de entrada a la demo del panel (ADR-0036). Es un formulario real: funciona también antes de que cargue el JS.
export function DemoEntry() {
  const [state, action, pending] = useActionState<DemoEntryState>(enterDemoAction, { status: 'idle' });
  return (
    <form action={action}>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? 'Entrando…' : 'Probar el panel'}
      </button>
      {state.status !== 'idle' ? (
        <p role="alert" className="mt-3 text-fg">
          {MESSAGES[state.status]}
        </p>
      ) : null}
    </form>
  );
}
