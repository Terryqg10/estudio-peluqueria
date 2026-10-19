import type { Metadata } from 'next';
import { SITE } from '@/lib/site';

export const metadata: Metadata = { title: 'Contacto' };

export default function ContactoPage() {
  const { address, phoneDisplay, phoneHref, hours } = SITE.contact;
  return (
    <section className="mx-auto w-full max-w-6xl px-(--layout-gutter) py-16 sm:py-24">
      <h1 className="text-display font-semibold">Contacto</h1>
      <dl className="mt-10 grid gap-8 sm:grid-cols-2">
        <div className="rounded-card bg-surface p-6 shadow-card">
          <dt className="text-fg-muted">Dirección</dt>
          <dd className="mt-1 text-lg">{address}</dd>
          <dt className="mt-6 text-fg-muted">Teléfono</dt>
          <dd className="mt-1 text-lg">
            <a
              href={phoneHref}
              className="inline-flex min-h-11 items-center text-accent-text transition-colors duration-(--duration-fast) hover:text-accent-hover"
            >
              {phoneDisplay}
            </a>
          </dd>
        </div>
        <div className="rounded-card bg-surface p-6 shadow-card">
          <dt className="text-fg-muted">Horario</dt>
          <dd className="mt-1">
            <ul className="space-y-2 text-lg">
              {hours.map((slot) => (
                <li key={slot.days} className="flex justify-between gap-4">
                  <span>{slot.days}</span>
                  <span className="text-fg-muted">{slot.time}</span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </section>
  );
}
