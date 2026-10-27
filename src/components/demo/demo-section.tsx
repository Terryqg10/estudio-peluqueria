import { isDemoEnabled } from '@/lib/demo/config';
import { DemoEntry } from './demo-entry';

// Invitación a recorrer el panel Admin (ADR-0036, RF-13): la «muestra 0» de la carta, dentro del hero. Solo existe con `DEMO_ENABLED=1`;
// sin la variable no se pinta nada, ni siquiera el contenedor.
export function DemoSection() {
  if (!isDemoEnabled()) return null;
  return (
    <section
      aria-labelledby="demo-titulo"
      className="mt-8 grid gap-4 border-y border-border-strong py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div>
        <h2 id="demo-titulo" className="font-display text-xl font-semibold tracking-tight leading-tight">
          Muestra 0: prueba el panel del salón
        </h2>
        <p className="mt-1 max-w-prose leading-relaxed text-fg-muted">
          Proyecto de portfolio. Panel de administración en solo lectura; los datos personales ajenos aparecen ocultos.
        </p>
      </div>
      <DemoEntry />
    </section>
  );
}
