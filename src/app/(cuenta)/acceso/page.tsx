import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { ROUTES } from '@/lib/routes';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Acceder a mis citas',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-control px-6 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';

export default async function AccesoPage() {
  // Con sesión abierta no hace falta pedir otro enlace.
  const client = await createAuthClient();
  const { data } = client ? await client.auth.getUser() : { data: { user: null } };
  if (data.user) redirect(ROUTES.misCitas);

  return (
    <section className="mx-auto w-full max-w-3xl px-(--layout-gutter) py-12 sm:py-16">
      <h1 className="font-display text-display font-semibold">Acceder a mis citas</h1>
      <p className="mt-3 max-w-prose text-fg-muted">
        Escribe tu email y te enviaremos un enlace para entrar. Sin contraseña.
      </p>
      <LoginForm />
      <div className="mt-8 flex flex-wrap gap-2">
        <Link href={ROUTES.reservar} className={LINK_CLASS}>
          Reservar una cita
        </Link>
        <Link href={ROUTES.home} className={LINK_CLASS}>
          Volver al inicio
        </Link>
      </div>
    </section>
  );
}
