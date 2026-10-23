import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GallerySection } from '@/components/home/gallery-section';
import type { GalleryItem } from '@/lib/gallery/gallery';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    scroll: _scroll,
    ...rest
  }: { href: string; children: React.ReactNode; scroll?: boolean } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/image', () => ({
  default: ({ src, alt, width, height, sizes }: { src: string; alt: string; width: number; height: number; sizes: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={width} height={height} sizes={sizes} />
  ),
}));

function item(id: string, technique: string, aiGenerated = true): GalleryItem {
  return {
    id,
    technique,
    serviceId: `00000000-0000-4000-8000-00000000000${id}`,
    serviceName: `Servicio ${technique}`,
    stylistName: `Estilista ${id}`,
    beforePath: `/images/galeria/${id}-antes.jpg`,
    afterPath: `/images/galeria/${id}-despues.jpg`,
    altBefore: `Antes ${id}`,
    altAfter: `Después ${id}`,
    aiGenerated,
  };
}

const ITEMS = [item('1', 'Balayage'), item('2', 'Corte'), item('3', 'Balayage', false)];

describe('GallerySection (T-011, CA-02)', () => {
  it('sin filtro muestra todos los trabajos y un filtro por técnica, activo en «Todas»', () => {
    render(<GallerySection gallery={{ ok: true, items: ITEMS }} selected={null} />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Balayage', 'Corte', 'Balayage']);
    const nav = screen.getByRole('navigation', { name: 'Filtrar la galería por técnica' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Todas', 'Balayage', 'Corte']);
    expect(within(nav).getByRole('link', { name: 'Todas' })).toHaveAttribute('aria-current', 'true');
    expect(within(nav).getByRole('link', { name: 'Corte' })).toHaveAttribute('href', '/?tecnica=Corte#galeria');
    expect(within(nav).getByRole('link', { name: 'Todas' })).toHaveAttribute('href', '/#galeria');
  });

  it('con una técnica elegida solo muestra esos trabajos y la marca como actual', () => {
    render(<GallerySection gallery={{ ok: true, items: ITEMS }} selected="Balayage" />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Balayage', 'Balayage']);
    expect(screen.getByRole('link', { name: 'Balayage' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'Todas' })).not.toHaveAttribute('aria-current');
  });

  it('cada trabajo indica técnica y estilista y enlaza a reservar su servicio', () => {
    render(<GallerySection gallery={{ ok: true, items: [ITEMS[1] as GalleryItem] }} selected={null} />);
    expect(screen.getByText('Con Estilista 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reservar Servicio Corte' })).toHaveAttribute(
      'href',
      '/reservar?servicio=00000000-0000-4000-8000-000000000002',
    );
  });

  it('las dos imágenes llevan alt, dimensiones y sizes; la nota de IA solo en las generadas', () => {
    render(<GallerySection gallery={{ ok: true, items: ITEMS }} selected={null} />);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(6);
    for (const img of images) {
      expect(img.getAttribute('alt')).toMatch(/.{5,}/);
      expect(img).toHaveAttribute('width', '1200');
      expect(img).toHaveAttribute('height', '900');
      expect(img.getAttribute('sizes')).toBeTruthy();
    }
    expect(screen.getAllByText('Imagen generada con IA.')).toHaveLength(2);
  });

  it('sin trabajos muestra «Pronto añadiremos trabajos» y sin filtros', () => {
    render(<GallerySection gallery={{ ok: true, items: [] }} selected={null} />);
    expect(screen.getByText('Pronto añadiremos trabajos.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Filtrar la galería por técnica' })).toBeNull();
  });

  it('si falla la carga muestra un error con reintento', () => {
    render(<GallerySection gallery={{ ok: false }} selected={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No hemos podido cargar la galería');
    expect(screen.getByRole('link', { name: 'Reintentar' })).toHaveAttribute('href', '/#galeria');
  });
});
