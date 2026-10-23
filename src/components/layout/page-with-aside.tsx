import type { ReactNode } from 'react';
import { HelpCard } from './help-card';

// Enlaces de texto de una fila bajo el contenido (T-023): el relleno lateral es de 12 px y la fila lleva
// -12 px a la izquierda, así que el texto queda alineado con el título y el fondo de hover no se sale del viewport
// (el gutter es de 16 px como mínimo).
export const TEXT_LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-3 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';
export const LINK_ROW_CLASS = '-ml-3 flex flex-wrap gap-2';

// Página de cuenta o de enlace con contenido estrecho (T-023). Contenedor alineado con la cabecera y el pie
// (`max-w-6xl`); desde `lg`, el contenido va a la izquierda y una columna de apoyo a la derecha, para no dejar la
// mitad de la pantalla vacía. El orden del DOM es el de lectura: contenido primero y apoyo después, también en
// móvil (nunca se invierte con CSS: la tabulación sigue el DOM, WCAG 2.4.3).
export function PageWithAside({
  children,
  aside = <HelpCard />,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-6xl px-(--layout-gutter) py-12 sm:py-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-16">
        <div className="min-w-0 max-w-3xl">{children}</div>
        {aside ? (
          <aside aria-label="Ayuda" data-page-aside>
            {aside}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
