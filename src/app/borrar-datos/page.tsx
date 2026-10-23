import type { Metadata } from 'next';
import Link from 'next/link';
import { LINK_ROW_CLASS, PageWithAside, TEXT_LINK_CLASS } from '@/components/layout/page-with-aside';
import { ROUTES } from '@/lib/routes';
import { DeletionForm } from './deletion-form';

export const metadata: Metadata = {
  title: 'Borrar mis datos',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function BorrarDatosPage() {
  return (
    <PageWithAside>
      <h1 className="font-display text-display font-semibold">Borrar mis datos</h1>
      <p className="mt-3 max-w-prose text-fg-muted">
        Escribe el email con el que reservaste y te enviaremos un enlace para confirmar el borrado de tus datos
        personales. Si tienes una cuenta, puedes borrarla desde «Mis citas».
      </p>
      <DeletionForm />
      <div className={`mt-8 ${LINK_ROW_CLASS}`}>
        <Link href={ROUTES.misCitas} className={TEXT_LINK_CLASS}>
          Mis citas
        </Link>
        <Link href={ROUTES.home} className={TEXT_LINK_CLASS}>
          Volver al inicio
        </Link>
      </div>
    </PageWithAside>
  );
}
