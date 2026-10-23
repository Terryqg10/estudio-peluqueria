import Link from 'next/link';
import { BOOKING_CTA, NAV_ITEMS } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { SITE } from '@/lib/site';

const FOOTER_LINK =
  'inline-flex min-h-11 items-center text-fg transition-colors duration-(--duration-fast) hover:text-accent-text';

// Pie en tres columnas desde `sm` (T-023): marca y contacto, navegación y datos personales. Solo enlaza páginas que
// existen: el aviso legal y la política de privacidad se añadirán cuando haya texto legal (VERIFICAR).
export function SiteFooter() {
  const { address, phoneDisplay, phoneHref } = SITE.contact;
  return (
    <footer className="border-t border-border bg-surface-muted">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-(--layout-gutter) pb-10 pt-10 sm:grid-cols-3">
        <div>
          <p className="text-lg font-semibold text-fg">{SITE.name}</p>
          <p className="mt-1 text-fg-muted">{SITE.tagline}</p>
          <p className="mt-4 text-fg-muted">{address}</p>
          <a href={phoneHref} className={`${FOOTER_LINK} text-accent-text`}>
            {phoneDisplay}
          </a>
        </div>
        <nav aria-label="Pie de página">
          <p className="font-semibold text-fg">Navegación</p>
          <ul className="mt-2 flex flex-col gap-1">
            {[...NAV_ITEMS, BOOKING_CTA].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={FOOTER_LINK}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Tus datos">
          <p className="font-semibold text-fg">Tus datos</p>
          <ul className="mt-2 flex flex-col gap-1">
            <li>
              <Link href={ROUTES.borrarDatos} className={FOOTER_LINK}>
                Borrar mis datos
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
