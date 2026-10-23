import type { Metadata } from 'next';
import Link from 'next/link';
import { TokenSchema } from '@/lib/booking/token';
import { LINK_ROW_CLASS, PageWithAside, TEXT_LINK_CLASS } from '@/components/layout/page-with-aside';
import { ROUTES } from '@/lib/routes';
import { confirmGuestDeletionAction } from './actions';

// El enlace trae un token de un solo uso: no se indexa, no se cachea y no se envía en el Referer (ADR-0032).
export const metadata: Metadata = {
  title: 'Confirmar el borrado de mis datos',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

const BUTTON_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover';

export default async function ConfirmarBorradoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  if (query.hecho === '1') {
    return (
      <PageWithAside>
        <h1 className="font-display text-display font-semibold">Datos borrados</h1>
        <p role="status" className="mt-3 max-w-prose text-fg-muted">
          Hemos borrado tus datos personales. Tus citas futuras han quedado canceladas y el enlace ya no funciona.
        </p>
        <div className={`mt-8 ${LINK_ROW_CLASS}`}>
          <Link href={ROUTES.home} className={TEXT_LINK_CLASS}>
            Volver al inicio
          </Link>
        </div>
      </PageWithAside>
    );
  }

  const token = TokenSchema.safeParse(query.token);
  const unavailable = query.error === 'servicio';

  if (!token.success || query.error) {
    return (
      <PageWithAside>
        <h1 className="font-display text-display font-semibold">
          {unavailable ? 'No hemos podido borrar tus datos' : 'Enlace no válido o caducado'}
        </h1>
        <p className="mt-3 max-w-prose text-fg-muted">
          {unavailable
            ? 'El servicio no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.'
            : 'Este enlace no existe, ya se ha usado o ha caducado. Pide uno nuevo para borrar tus datos.'}
        </p>
        <div className={`mt-8 ${LINK_ROW_CLASS}`}>
          <Link href={ROUTES.borrarDatos} className={TEXT_LINK_CLASS}>
            Pedir un enlace nuevo
          </Link>
          <Link href={ROUTES.home} className={TEXT_LINK_CLASS}>
            Volver al inicio
          </Link>
        </div>
      </PageWithAside>
    );
  }

  return (
    <PageWithAside>
      <h1 className="font-display text-display font-semibold">Confirmar el borrado</h1>
      <p className="mt-3 max-w-prose text-fg-muted">
        Se borrarán tu nombre, email y teléfono de todas tus citas y las citas futuras se cancelarán. No se puede
        deshacer.
      </p>
      <form action={confirmGuestDeletionAction} className="mt-8">
        <input type="hidden" name="token" value={token.data} />
        <button type="submit" className={BUTTON_CLASS}>
          Confirmar el borrado de mis datos
        </button>
      </form>
      <div className={`mt-6 ${LINK_ROW_CLASS}`}>
        <Link href={ROUTES.home} className={TEXT_LINK_CLASS}>
          No, volver al inicio
        </Link>
      </div>
    </PageWithAside>
  );
}
