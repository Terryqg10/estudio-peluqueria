import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { DeletionForm } from './deletion-form';

export const metadata: Metadata = {
  title: 'Borrar mis datos',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-6 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';

export default function BorrarDatosPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-(--layout-gutter) py-12 sm:py-16">
      <h1 className="font-display text-display font-semibold">Borrar mis datos</h1>
      <p className="mt-3 max-w-prose text-fg-muted">
        Escribe el email con el que reservaste y te enviaremos un enlace para confirmar el borrado de tus datos
        personales. Si tienes una cuenta, puedes borrarla desde «Mis citas».
      </p>
      <DeletionForm />
      <div className="mt-8 flex flex-wrap gap-2">
        <Link href={ROUTES.misCitas} className={LINK_CLASS}>
          Mis citas
        </Link>
        <Link href={ROUTES.home} className={LINK_CLASS}>
          Volver al inicio
        </Link>
      </div>
    </section>
  );
}
