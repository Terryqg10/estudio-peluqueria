import { ContactInfo } from '@/components/contact/contact-info';
import { Hero } from '@/components/home/hero';
import { ServicesSection } from '@/components/home/services-section';
import { getServiceCatalog } from '@/lib/services/catalog';

// El catálogo se lee en cada petición para reflejar los cambios del Admin (T-009).
export const dynamic = 'force-dynamic';

export default async function Home() {
  const catalog = await getServiceCatalog();

  return (
    <>
      <Hero />
      <ServicesSection catalog={catalog} />
      <section
        id="contacto"
        aria-labelledby="contacto-titulo"
        className="mx-auto w-full max-w-6xl scroll-mt-24 px-(--layout-gutter) py-12 sm:py-16"
      >
        <h2 id="contacto-titulo" className="font-display text-3xl font-semibold">
          Visítanos
        </h2>
        <div className="mt-8">
          <ContactInfo />
        </div>
      </section>
    </>
  );
}
