import type { ReactNode } from 'react';

// Modo demo (ADR-0036, T-028): en solo lectura envuelve los controles de escritura en un `<fieldset disabled>`, que
// desactiva de golpe todo botón y campo de dentro (también para teclado y lectores de pantalla) y lo explica con texto.
// Es ayuda para quien visita la demo; la barrera real es la BD, que rechaza la escritura de la cuenta demo.
export function ReadOnlyScope({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  if (!readOnly) return <>{children}</>;
  return (
    <div data-read-only className="mt-6">
      <p className="mb-3 rounded-card bg-accent-soft p-3 text-fg">Desactivado en la demo: solo se puede mirar.</p>
      <fieldset disabled className="m-0 min-w-0 border-0 p-0 opacity-70">
        {children}
      </fieldset>
    </div>
  );
}
