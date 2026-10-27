import { SITE } from '@/lib/site';

export function ContactInfo() {
  const { address, phoneDisplay, phoneHref, hours } = SITE.contact;
  return (
    <dl className="grid gap-8 sm:grid-cols-2">
      <div className="border-t border-border-strong pt-5">
        <dt className="text-fg-muted">Dirección</dt>
        <dd className="mt-1 text-lg">{address}</dd>
        <dt className="mt-6 text-fg-muted">Teléfono</dt>
        <dd className="mt-1 text-lg">
          <a
            href={phoneHref}
            className="inline-flex min-h-11 items-center font-semibold text-fg transition-colors duration-(--duration-fast) ease-(--ease-soft) hover:text-accent-text"
          >
            {phoneDisplay}
          </a>
        </dd>
      </div>
      <div className="border-t border-border-strong pt-5">
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
  );
}
