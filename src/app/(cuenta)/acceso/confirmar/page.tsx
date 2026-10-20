import type { Metadata } from 'next';
import Link from 'next/link';
import { TokenHashSchema } from '@/lib/account/schema';
import { ROUTES } from '@/lib/routes';
import { confirmLoginAction } from './actions';

// El enlace trae un token de un solo uso: no se indexa ni se envía en la cabecera Referer (ADR-0021).
export const metadata: Metadata = {
  title: 'Confirmar acceso',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

const LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-6 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';
const BUTTON_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover';

export default async function ConfirmarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const tokenHash = TokenHashSchema.safeParse(query.token_hash);
  const unavailable = query.error === 'servicio';

  if (!tokenHash.success || query.error) {
    return (
      <section className="mx-auto w-full max-w-3xl px-(--layout-gutter) py-12 sm:py-16">
        <h1 className="font-display text-display font-semibold">
          {unavailable ? 'No hemos podido entrar' : 'Enlace no válido o caducado'}
        </h1>
        <p className="mt-3 max-w-prose text-fg-muted">
          {unavailable
            ? 'El servicio no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.'
            : 'Este enlace no existe, ya se ha usado o ha caducado. Pide uno nuevo para entrar.'}
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <Link href={ROUTES.acceso} className={LINK_CLASS}>
            Pedir un enlace nuevo
          </Link>
          <Link href={ROUTES.home} className={LINK_CLASS}>
            Volver al inicio
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-(--layout-gutter) py-12 sm:py-16">
      <h1 className="font-display text-display font-semibold">Entrar en mi cuenta</h1>
      <p className="mt-3 max-w-prose text-fg-muted">Pulsa el botón para ver tus citas.</p>
      <form action={confirmLoginAction} className="mt-8">
        <input type="hidden" name="token_hash" value={tokenHash.data} />
        <button type="submit" className={BUTTON_CLASS}>
          Entrar en mi cuenta
        </button>
      </form>
    </section>
  );
}
