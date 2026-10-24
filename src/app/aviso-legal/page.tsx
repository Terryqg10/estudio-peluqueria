import type { Metadata } from 'next';
import Link from 'next/link';
import { PageWithAside } from '@/components/layout/page-with-aside';
import { ROUTES } from '@/lib/routes';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Aviso de demostración',
  description: `${SITE.name} es un proyecto de portfolio: el salón, sus datos y sus citas son ficticios.`,
};

const H2 = 'mt-10 font-display text-2xl font-semibold';
// Enlaces dentro de un párrafo: en negrita para distinguirse del texto sin depender solo del color (WCAG 1.4.1).
const LINK = 'font-semibold text-accent-text';

// Aviso de demostración (ADR-0038, CA-52). No es un aviso legal de un negocio: dice qué es esta web y qué es ficticio.
// No es asesoramiento legal (VERIFICAR si el proyecto pasara a ser un negocio real).
export default function AvisoLegalPage() {
  return (
    <PageWithAside aside={null}>
      <h1 className="font-display text-display font-semibold">Aviso de demostración</h1>
      <p className="mt-3 max-w-prose text-lg text-fg-muted">
        {SITE.name} es un salón ficticio: esta web es un proyecto de portfolio, no un negocio real.
      </p>

      <h2 className={H2}>Qué es ficticio</h2>
      <ul className="mt-4 max-w-prose list-disc space-y-2 pl-6">
        <li>El salón, su nombre, su dirección, su teléfono y su horario.</li>
        <li>Las estilistas, los servicios y los precios.</li>
        <li>Las citas que ves en el panel de ejemplo y los nombres de sus clientas.</li>
        <li>
          <strong>No se atiende ninguna cita</strong>: reservar aquí no reserva nada en ninguna peluquería.
        </li>
      </ul>

      <h2 className={H2}>Quién lo hace y para qué</h2>
      <p className="mt-4 max-w-prose">
        Lo ha creado su autor para enseñar cómo se construye una web de reservas completa: reserva en tiempo real, cuentas,
        panel de administración, privacidad y accesibilidad. Más proyectos y cómo contactar en{' '}
        <a href={SITE.demo.portfolioUrl} className={LINK}>
          terryq.com
        </a>
        . El código está en{' '}
        <a href={SITE.demo.repositoryUrl} className={LINK}>
          GitHub
        </a>
        .
      </p>

      <h2 className={H2}>Imágenes</h2>
      <ul className="mt-4 max-w-prose list-disc space-y-2 pl-6">
        <li>
          La foto de portada es de RDNE Stock project, en{' '}
          <a href="https://www.pexels.com/photo/curly-haired-woman-with-crocodile-hair-clip-7755215/" className={LINK}>
            Pexels
          </a>
          .
        </li>
        <li>
          Las imágenes del «antes y después» no son trabajos reales: son ilustraciones o imágenes generadas con inteligencia
          artificial, y se indica cuando es así.
        </li>
      </ul>

      <h2 className={H2}>Panel de administración</h2>
      <p className="mt-4 max-w-prose">
        El botón «Probar el panel» de la página de inicio abre una cuenta de demostración de solo lectura. No puede modificar
        nada y los datos personales de otras personas aparecen ocultos.
      </p>

      <h2 className={H2}>Tus datos</h2>
      <p className="mt-4 max-w-prose">
        Aunque sea una demo, los formularios guardan lo que escribas. Usa datos ficticios y consulta{' '}
        <Link href={ROUTES.privacidad} className={LINK}>
          qué guarda esta demo
        </Link>{' '}
        y cómo borrarlo.
      </p>

      <p className="mt-10 max-w-prose text-fg-muted">
        Este aviso no es asesoramiento legal. Última revisión: 24 de octubre de 2026.
      </p>
    </PageWithAside>
  );
}
