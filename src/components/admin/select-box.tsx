import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

// Contenedor de un `<select>` con chevron propio (T-033, hallazgo 4 del pase visual): el `<select>` hijo lleva `appearance-none` y
// relleno derecho (`SELECT_BOX_CLASS`), y el icono queda dentro del campo, alineado con el relleno y sin capturar el clic.
export const SELECT_BOX_CLASS =
  'min-h-11 w-full appearance-none rounded-card border border-border bg-surface py-2 pl-4 pr-10 text-fg disabled:opacity-60';

export function SelectBox({ children }: { children: ReactNode }) {
  return (
    <div className="relative mt-1">
      {children}
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
      />
    </div>
  );
}
