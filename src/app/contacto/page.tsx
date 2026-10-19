import type { Metadata } from 'next';
import { ContactInfo } from '@/components/contact/contact-info';

export const metadata: Metadata = { title: 'Contacto' };

export default function ContactoPage() {
  return (
    <section className="mx-auto w-full max-w-6xl px-(--layout-gutter) py-16 sm:py-24">
      <h1 className="font-display text-display font-semibold">Contacto</h1>
      <div className="mt-10">
        <ContactInfo />
      </div>
    </section>
  );
}
