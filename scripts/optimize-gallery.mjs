#!/usr/bin/env node
// Optimiza las imágenes de la galería antes/después (T-031, docs/imagenes.md): recorta al centro a un cuadrado, reduce a
// 1000×1000 y guarda WebP bajo `public/images/galeria/` con el nombre que espera la BD (`galeria-<técnica>-<n>-antes|despues`).
// Baja la calidad hasta que cada archivo pesa ≤ 120 KB (PLAN-001, 5a). Cross-platform (Node). Usa `sharp`, que ya instala Next.
//
//   node scripts/optimize-gallery.mjs <carpeta con los originales>
//
// Los originales (`<nombre>-antes.jpg` y `<nombre>-despues.jpg`) no se tocan ni se copian al repo.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'images', 'galeria');
const SIZE = 1000;
const MAX_BYTES = 120 * 1024;

// nombre del original → nombre definitivo (<técnica>-<n>)
export const PAIRS = [
  ['balayage', 'balayage-1'],
  ['mechas', 'mechas-1'],
  ['color', 'color-1'],
  ['corte-capas', 'corte-1'],
  ['corte-bob', 'corte-2'],
  ['peinado-ondas', 'peinado-1'],
  ['tratamiento-keratina', 'tratamiento-1'],
];

function out(msg) { process.stdout.write(`[optimize-gallery] ${msg}\n`); }
function fail(msg) { process.stderr.write(`[optimize-gallery] x ${msg}\n`); process.exit(1); }

async function main() {
  const source = process.argv[2];
  if (!source) fail('Uso: node scripts/optimize-gallery.mjs <carpeta con los originales>');
  const dir = path.resolve(source);
  if (!fs.existsSync(dir)) fail(`No existe la carpeta ${dir}`);

  // `sharp` es dependencia opcional de Next: se resuelve desde él.
  const sharp = createRequire(createRequire(import.meta.url).resolve('next/package.json'))('sharp');

  fs.mkdirSync(OUT, { recursive: true });
  let total = 0;
  for (const [from, to] of PAIRS) {
    for (const kind of ['antes', 'despues']) {
      const input = path.join(dir, `${from}-${kind}.jpg`);
      if (!fs.existsSync(input)) fail(`Falta ${input}`);
      let buffer = null;
      let quality = 80;
      for (; quality >= 40; quality -= 5) {
        buffer = await sharp(input)
          .rotate()
          .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
          .webp({ quality, effort: 5 })
          .toBuffer();
        if (buffer.length <= MAX_BYTES) break;
      }
      if (!buffer || buffer.length > MAX_BYTES) fail(`${from}-${kind}: no baja de ${MAX_BYTES / 1024} KB`);
      const target = path.join(OUT, `galeria-${to}-${kind}.webp`);
      fs.writeFileSync(target, buffer);
      total += buffer.length;
      out(`${path.basename(target)}: ${(buffer.length / 1024).toFixed(0)} KB (calidad ${quality})`);
    }
  }
  out(`Hecho: ${PAIRS.length * 2} imágenes, ${(total / 1024).toFixed(0)} KB en total.`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
