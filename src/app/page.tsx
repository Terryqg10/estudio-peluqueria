import { ContactInfo } from '@/components/contact/contact-info';
import { GallerySection } from '@/components/home/gallery-section';
import { Hero } from '@/components/home/hero';
import { ServicesSection } from '@/components/home/services-section';
import { getGallery, parseTechnique } from '@/lib/gallery/gallery';
import { getServiceCatalog } from '@/lib/services/catalog';

// El catálogo se lee en cada petición para reflejar los cambios del Admin (T-009).
export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ tecnica?: string | string[] }> }) {
  const [catalog, gallery, query] = await Promise.all([getServiceCatalog(), getGallery(), searchParams]);
  const technique = gallery.ok ? parseTechnique(query.tecnica, gallery.items) : null;

  return (
    <>
      <Hero />
      <ServicesSection catalog={catalog} />
      <GallerySection gallery={gallery} selected={technique} />
      <section
        id="contacto"
        aria-labelledby="contacto-titulo"
        className="mx-auto w-full max-w-6xl scroll-mt-24 px-(--layout-gutter) py-12 sm:py-16"
      >
        <h2 id="contacto-titulo" className="font-display text-3xl font-semibold tracking-tight leading-tight">
          Visítanos
        </h2>
        <div className="mt-8">
          <ContactInfo />
        </div>
      </section>
    </>
  );
}
