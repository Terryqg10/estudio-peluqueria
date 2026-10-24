import type { Metadata } from 'next';
import Link from 'next/link';
import { PageWithAside } from '@/components/layout/page-with-aside';
import { ROUTES } from '@/lib/routes';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacidad',
  description: `Qué datos guarda la demo de ${SITE.name}, para qué, cuánto tiempo y cómo borrarlos.`,
};

const H2 = 'mt-10 font-display text-2xl font-semibold';
// Enlaces dentro de un párrafo: en negrita para distinguirse del texto sin depender solo del color (WCAG 1.4.1).
const LINK = 'font-semibold text-accent-text';

type Row = { dato: string; paraQue: string; donde: string; cuanto: string };

// Lo que la demo guarda de verdad (spec, sección 9). Si se toca un dato personal, hay que actualizar esta tabla.
const ROWS: Row[] = [
  {
    dato: 'Nombre, email y teléfono al reservar',
    paraQue: 'Gestionar la cita de la demo y avisar de cambios',
    donde: 'Base de datos de Supabase (UE, Frankfurt)',
    cuanto: 'Mientras exista la cita; se anonimizan a petición o tras 24 meses sin citas (proceso manual en esta demo)',
  },
  {
    dato: 'Fecha y versión del consentimiento',
    paraQue: 'Probar que aceptaste guardar tus datos',
    donde: 'Base de datos de Supabase',
    cuanto: 'Mientras exista el dato asociado',
  },
  {
    dato: 'Enlace personal de la cita (solo su huella)',
    paraQue: 'Ver, cambiar o cancelar la cita sin cuenta',
    donde: 'Base de datos de Supabase; nunca el enlace en claro',
    cuanto: 'Hasta el inicio de la cita',
  },
  {
    dato: 'Email de tu cuenta («Mis citas»)',
    paraQue: 'Entrar con un enlace por email y ver tus citas',
    donde: 'Supabase Auth',
    cuanto: 'Hasta que borres la cuenta',
  },
  {
    dato: 'Tu IP (solo una huella con clave secreta)',
    paraQue: 'Limitar el abuso: reservas, enlaces de acceso y entradas a la demo',
    donde: 'Base de datos de Supabase',
    cuanto: 'Unas horas; caduca sola',
  },
  {
    dato: 'Mensajes del chat de ayuda',
    paraQue: 'No se guardan ni se envían',
    donde: 'Solo en tu navegador mientras el chat está abierto',
    cuanto: 'Hasta que lo cierras',
  },
];

// Privacidad de la demo (ADR-0038, CA-52). Cuenta solo lo que el sistema hace; no inventa cláusulas legales y no es
// asesoramiento legal (VERIFICAR si el proyecto pasara a ser un negocio real).
export default function PrivacidadPage() {
  return (
    <PageWithAside aside={null}>
      <h1 className="font-display text-display font-semibold">Privacidad</h1>
      <p className="mt-3 max-w-prose text-lg text-fg-muted">
        Esta web es una demo de portfolio. Aquí se cuenta, con la mayor exactitud posible, qué datos guarda.
      </p>

      <p className="mt-6 max-w-prose rounded-card bg-accent-soft p-4 text-fg">
        <strong>Usa datos ficticios.</strong> No hace falta escribir tu nombre, tu email ni tu teléfono reales para probarla: un
        email inventado sirve.
      </p>

      <h2 className={H2}>Qué datos se guardan</h2>
      <div className="mt-4 hidden overflow-hidden rounded-container bg-surface shadow-card md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">Datos que guarda la demo, para qué, dónde y cuánto tiempo</caption>
          <thead>
            <tr className="bg-surface-muted">
              <th scope="col" className="p-4 font-semibold">Dato</th>
              <th scope="col" className="p-4 font-semibold">Para qué</th>
              <th scope="col" className="p-4 font-semibold">Dónde</th>
              <th scope="col" className="p-4 font-semibold">Cuánto tiempo</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.dato} className="border-t border-border align-top">
                <th scope="row" className="p-4 font-semibold">{row.dato}</th>
                <td className="p-4">{row.paraQue}</td>
                <td className="p-4">{row.donde}</td>
                <td className="p-4">{row.cuanto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-4 space-y-3 md:hidden">
        {ROWS.map((row) => (
          <li key={row.dato} className="rounded-container bg-surface p-5 shadow-card">
            <p className="font-semibold">{row.dato}</p>
            <dl className="mt-2 space-y-1">
              <div><dt className="inline font-semibold">Para qué: </dt><dd className="inline">{row.paraQue}</dd></div>
              <div><dt className="inline font-semibold">Dónde: </dt><dd className="inline">{row.donde}</dd></div>
              <div><dt className="inline font-semibold">Cuánto tiempo: </dt><dd className="inline">{row.cuanto}</dd></div>
            </dl>
          </li>
        ))}
      </ul>

      <h2 className={H2}>Quién más interviene</h2>
      <ul className="mt-4 max-w-prose list-disc space-y-2 pl-6">
        <li><strong>Supabase</strong>: base de datos y acceso por email.</li>
        <li>
          <strong>Vercel</strong>: aloja la web; sus registros técnicos pueden incluir tu IP (<strong>VERIFICAR</strong> sus términos).
        </li>
        <li>
          <strong>Resend</strong>: envía los emails (confirmación de cita y enlaces de acceso o de borrado) solo si el envío está
          activo; tu nombre y tu email viajan a este proveedor para entregarlos.
        </li>
      </ul>

      <h2 className={H2}>Cookies</h2>
      <p className="mt-4 max-w-prose">
        Solo cookies funcionales de la propia web: la de tu sesión si entras en «Mis citas» o pruebas el panel, y una de diez
        minutos que recuerda tu última reserva para mostrarte la confirmación. No hay cookies de analítica ni de terceros.
      </p>

      <h2 className={H2}>Cuenta de demostración del panel</h2>
      <p className="mt-4 max-w-prose">
        «Probar el panel» abre una cuenta ficticia fija, de solo lectura, que no guarda datos tuyos salvo una huella de tu IP
        durante unas horas para limitar el abuso. Su sesión caduca a la hora.
      </p>

      <h2 className={H2}>Cómo borrar tus datos</h2>
      <p className="mt-4 max-w-prose">
        Escribe tu email en{' '}
        <Link href={ROUTES.borrarDatos} className={LINK}>
          Borrar mis datos
        </Link>{' '}
        y te enviaremos un enlace para confirmarlo; tus citas pasan a quedar anonimizadas. Si tienes una cuenta, también puedes
        borrarla desde «Mis citas». Para cualquier duda, contacta con el autor en{' '}
        <a href={SITE.demo.portfolioUrl} className={LINK}>
          terryq.com
        </a>
        .
      </p>

      <p className="mt-10 max-w-prose text-fg-muted">
        Esto describe lo que hace esta demo y no es asesoramiento legal ni sustituye a una política de privacidad revisada por un
        profesional (<strong>VERIFICAR</strong> si el proyecto pasara a ser un negocio real). Última revisión: 24 de octubre de 2026.{' '}
        <Link href={ROUTES.avisoLegal} className={LINK}>
          Aviso de demostración
        </Link>
        .
      </p>
    </PageWithAside>
  );
}
