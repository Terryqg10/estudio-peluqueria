import { isDemoEnabled } from '@/lib/demo/config';
import { DemoEntry } from './demo-entry';

// Invitación a recorrer el panel Admin (ADR-0036, RF-13). Solo existe con `DEMO_ENABLED=1`; sin la variable no
// se pinta nada, ni siquiera el contenedor.
export function DemoSection() {
  if (!isDemoEnabled()) return null;
  return (
    <section
      aria-labelledby="demo-titulo"
      className="mx-auto w-full max-w-6xl px-(--layout-gutter) py-4 sm:py-8"
    >
      <div className="grid gap-6 rounded-container bg-accent-soft p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <h2 id="demo-titulo" className="font-display text-2xl font-semibold tracking-tight leading-tight">
            Proyecto de portfolio: prueba el panel del salón
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-fg">
            Entra con un clic al panel de administración en modo solo lectura: agenda, servicios, bloqueos y horarios. Los
            datos personales de otras personas aparecen ocultos y no se puede modificar nada.
          </p>
        </div>
        <DemoEntry />
      </div>
    </section>
  );
}
