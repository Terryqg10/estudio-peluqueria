import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-brand' });

export const metadata: Metadata = {
  title: '{{ project_name }}',
  description: '{{ project_description }}',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={geist.variable}>
      <body className="bg-bg text-fg antialiased">{children}</body>
    </html>
  );
}
