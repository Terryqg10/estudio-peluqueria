import type { Metadata } from 'next';
import { Fraunces, Geist } from 'next/font/google';
import { SiteHeader } from '@/components/layout/site-header';
import { Chatbot } from '@/components/chatbot/chatbot';
import { SiteFooter } from '@/components/layout/site-footer';
import { SITE } from '@/lib/site';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-brand' });
// Titulares (ADR-0012): Fraunces variable, autoalojada por next/font.
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-heading', display: 'swap' });

export const metadata: Metadata = {
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${geist.variable} ${fraunces.variable}`}>
      <body className="flex min-h-dvh flex-col bg-bg font-sans text-fg antialiased">
        <a
          href="#contenido"
          className="sr-only rounded-control bg-accent px-4 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
        >
          Saltar al contenido
        </a>
        <SiteHeader />
        <main id="contenido" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <Chatbot whatsappNumber={SITE.contact.whatsapp} />
      </body>
    </html>
  );
}
