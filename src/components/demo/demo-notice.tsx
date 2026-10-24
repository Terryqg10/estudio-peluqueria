import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

// Aviso de datos ficticios (ADR-0038, CA-53): esta web es una demo de portfolio y sus formularios recogen datos personales,
// así que se pide usar datos inventados y se enlaza a lo que de verdad se guarda.
export function DemoNotice({ className = '' }: { className?: string }) {
  return (
    <p data-demo-notice className={`rounded-card bg-accent-soft p-4 text-fg ${className}`.trim()}>
      <strong>Es una demo.</strong> No se atienden citas reales: usa datos ficticios (por ejemplo, un email inventado).{' '}
      <Link href={ROUTES.privacidad} className="font-semibold text-accent-text">
        Qué guarda esta demo
      </Link>
      .
    </p>
  );
}
