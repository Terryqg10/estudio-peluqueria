import { SITE } from '@/lib/site';

export default function Home() {
  return (
    <section className="mx-auto w-full max-w-6xl px-(--layout-gutter) py-16 sm:py-24">
      <p className="text-accent-text">{SITE.tagline}</p>
      <h1 className="mt-3 max-w-3xl text-display font-semibold">
        Tu cabello, en las mejores manos
      </h1>
      <p className="mt-6 max-w-prose text-lg text-fg-muted">
        Precios claros y reserva online con la disponibilidad real de cada estilista.
      </p>
    </section>
  );
}
