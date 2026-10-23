import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { SITE } from '@/lib/site';

// Columna de apoyo de las páginas de cuenta y de enlaces (T-023): contacto y horario del salón a partir de
// `SITE`, sin textos nuevos. Va después del contenido principal, tanto en el DOM como en móvil.
export function HelpCard() {
  const { phoneDisplay, phoneHref, hours } = SITE.contact;
  return (
    <div className="rounded-card bg-surface p-6 shadow-card">
      <h2 className="font-display text-xl font-semibold">¿Necesitas ayuda?</h2>
      <p className="mt-2 text-fg-muted">Llámanos o consulta el horario del salón.</p>
      <a
        href={phoneHref}
        className="mt-3 inline-flex min-h-11 items-center text-lg text-accent-text transition-colors duration-(--duration-fast) hover:text-accent-hover"
      >
        {phoneDisplay}
      </a>
      <ul className="mt-3 space-y-2">
        {hours.map((slot) => (
          <li key={slot.days} className="flex justify-between gap-4">
            <span>{slot.days}</span>
            <span className="text-fg-muted">{slot.time}</span>
          </li>
        ))}
      </ul>
      <Link
        href={ROUTES.contacto}
        className="mt-4 inline-flex min-h-11 items-center text-accent-text transition-colors duration-(--duration-fast) hover:text-accent-hover"
      >
        Ver todos los datos de contacto
      </Link>
    </div>
  );
}
