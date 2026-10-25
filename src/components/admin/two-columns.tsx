import type { ReactNode } from "react";

// Páginas del panel con poco contenido (T-034, hallazgo 5): a partir de `lg`, el contenido ocupa la primera columna
// (el ancho de lectura de siempre, 48 rem) y una tarjeta de resumen la segunda, en vez de dejar un tercio vacío.
// En móvil y tablet es una sola columna y el resumen va después. El orden del DOM es el de lectura: no se invierte con CSS.
export function AdminTwoColumns({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,48rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
      {children}
      {aside}
    </div>
  );
}

export type SummaryItem = { label: string; value: string };

// Tarjeta de resumen: solo muestra datos que ya se leen de la BD en la propia página.
export function SummaryCard({
  title,
  items,
}: {
  title: string;
  items: SummaryItem[];
}) {
  return (
    <aside
      aria-labelledby="resumen-titulo"
      className="mt-10 rounded-container bg-surface p-6 shadow-card lg:mt-0"
    >
      <h2 id="resumen-titulo" className="font-display text-2xl font-semibold">
        {title}
      </h2>
      <dl className="mt-4 divide-y divide-border">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
          >
            <dt className="text-fg-muted">{item.label}</dt>
            <dd className="font-semibold">{item.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
