import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdminSession } from '@/lib/account/require-admin';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { LINK_ROW_CLASS, PageWithAside, TEXT_LINK_CLASS } from '@/components/layout/page-with-aside';
import { ROUTES } from '@/lib/routes';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Acceder a mis citas',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AccesoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  // Con sesión abierta no hace falta pedir otro enlace.
  const client = await createAuthClient();
  const { data } = client ? await client.auth.getUser() : { data: { user: null } };
  if (client && data.user) redirect((await isAdminSession(client)) ? ROUTES.admin : ROUTES.misCitas);

  return (
    <PageWithAside>
      <h1 className="font-display text-display font-semibold">Acceder a mis citas</h1>
      {query.borrado === '1' ? (
        <p role="status" className="mt-6 rounded-card bg-accent-soft p-4 text-fg">
          Hemos borrado tu cuenta y tus datos personales.
        </p>
      ) : null}
      <p className="mt-3 max-w-prose text-fg-muted">
        Escribe tu email y te enviaremos un enlace para entrar. Sin contraseña.
      </p>
      <LoginForm />
      <div className={`mt-8 ${LINK_ROW_CLASS}`}>
        <Link href={ROUTES.reservar} className={TEXT_LINK_CLASS}>
          Reservar una cita
        </Link>
        <Link href={ROUTES.home} className={TEXT_LINK_CLASS}>
          Volver al inicio
        </Link>
      </div>
    </PageWithAside>
  );
}
