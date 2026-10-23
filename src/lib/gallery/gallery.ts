import { createPublicClient } from '@/lib/supabase/public-client';

// Galería antes/después (T-011, RF-01, CA-02). Se lee con la clave anónima: la RLS solo deja ver los trabajos
// activos. Un trabajo cuyo servicio o estilista ya no es público (inactivo) no se muestra.

export type GalleryItem = {
  id: string;
  technique: string;
  serviceId: string;
  serviceName: string;
  stylistName: string;
  beforePath: string;
  afterPath: string;
  altBefore: string;
  altAfter: string;
  aiGenerated: boolean;
};

export type GalleryResult = { ok: true; items: GalleryItem[] } | { ok: false };

export async function getGallery(): Promise<GalleryResult> {
  const client = createPublicClient();
  if (!client) return { ok: false };

  const { data, error } = await client
    .from('gallery_items')
    .select('id, technique, before_path, after_path, alt_before, alt_after, ai_generated, services(id, name), stylists(name)')
    .order('sort_order', { ascending: true });
  if (error || !data) return { ok: false };

  const items: GalleryItem[] = [];
  for (const row of data) {
    if (!row.services || !row.stylists) continue;
    items.push({
      id: row.id,
      technique: row.technique,
      serviceId: row.services.id,
      serviceName: row.services.name,
      stylistName: row.stylists.name,
      beforePath: row.before_path,
      afterPath: row.after_path,
      altBefore: row.alt_before,
      altAfter: row.alt_after,
      aiGenerated: row.ai_generated,
    });
  }
  return { ok: true, items };
}

// Técnicas distintas, en el orden de aparición de la galería.
export function techniquesOf(items: readonly GalleryItem[]): string[] {
  return [...new Set(items.map((i) => i.technique))];
}

// `?tecnica=` llega del navegador (entrada externa): solo vale una técnica que exista; si no, se ignora.
export function parseTechnique(raw: string | string[] | undefined, items: readonly GalleryItem[]): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  return techniquesOf(items).includes(value) ? value : null;
}

export function filterByTechnique(items: readonly GalleryItem[], technique: string | null): GalleryItem[] {
  return technique === null ? [...items] : items.filter((i) => i.technique === technique);
}
