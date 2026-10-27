#!/usr/bin/env node
// gen-swatches.mjs — genera las muestras de mechón de la carta de color (T-041, estilo v5-color-chart).
//
// Salida: public/images/carta/muestra-N.svg (colgada) y muestra-N-h.svg (tumbada), N de 1 a 8. Son ilustraciones propias, deterministas (misma semilla, mismo
// resultado), ligeras y sin dependencias. Los colores de pelo viven aquí, dentro de las imágenes, y no son tokens
// (palette-rules.md: «el resto solo en imágenes»). Uso: node scripts/gen-swatches.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'images', 'carta');

// Tonos de la carta, del más oscuro al más claro (nivel orientativo de cada muestra).
const SHADES = [
  { base: [42, 26, 20], reflejo: [96, 52, 34] },
  { base: [72, 44, 30], reflejo: [150, 88, 52] },
  { base: [104, 62, 38], reflejo: [182, 110, 58] },
  { base: [140, 90, 52], reflejo: [208, 142, 78] },
  { base: [176, 122, 63], reflejo: [226, 170, 104] },
  { base: [201, 160, 95], reflejo: [238, 204, 140] },
  { base: [223, 196, 138], reflejo: [244, 226, 176] },
  { base: [235, 221, 182], reflejo: [248, 240, 212] },
];

const W = 120;
const H = 440;
const TAB_H = 46; // lengüeta de cartulina con el número (la numeración la pone el HTML, no la imagen)
const STRANDS = 44;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const rgb = (c, d = 0) => `rgb(${clamp(c[0] + d)} ${clamp(c[1] + d)} ${clamp(c[2] + d)})`;
const n = (v) => Number(v.toFixed(1));

function swatch(index) {
  const rand = rng(1000 + index * 7919);
  const { base, reflejo } = SHADES[index];
  const strands = [];

  for (let i = 0; i < STRANDS; i += 1) {
    const t = i / (STRANDS - 1);
    const x0 = 40 + t * 40 + (rand() - 0.5) * 2;
    const flare = (t - 0.5) * 26;
    const wave = 5 + rand() * 7;
    const phase = rand() * Math.PI * 2;
    const y0 = TAB_H - 2;
    const y1 = H - 6 - rand() * 14;
    const xEnd = W / 2 + flare * 1.2 + (rand() - 0.5) * 5;
    const c1x = x0 + Math.sin(phase) * wave;
    const c2x = (x0 + xEnd) / 2 + Math.cos(phase) * wave * 1.4;
    const d = `M${n(x0)} ${y0} C${n(c1x)} ${n(y0 + (y1 - y0) * 0.33)} ${n(c2x)} ${n(y0 + (y1 - y0) * 0.66)} ${n(xEnd)} ${n(y1)}`;
    const isReflejo = rand() < 0.22;
    const tone = isReflejo ? reflejo : base;
    const jitter = (rand() - 0.5) * 26;
    const width = 2.2 + rand() * 1.6;
    strands.push(
      `<path d="${d}" stroke="${rgb(tone, jitter)}" stroke-width="${n(width)}" stroke-linecap="round" opacity="${n(0.82 + rand() * 0.18)}"/>`,
    );
  }

  // Brillo: unos pocos trazos finos claros por encima, siguiendo la forma del mechón.
  const shine = [];
  for (let i = 0; i < 6; i += 1) {
    const x0 = 42 + rand() * 36;
    const xEnd = W / 2 + (x0 - 60) * 1.2;
    const y1 = 120 + rand() * 150;
    shine.push(
      `<path d="M${n(x0)} ${TAB_H + 4} C${n(x0 + 4)} ${n(TAB_H + 70)} ${n(xEnd - 4)} ${n(y1 - 60)} ${n(xEnd)} ${n(y1)}" stroke="rgb(255 255 255)" stroke-width="1.1" stroke-linecap="round" opacity="0.22"/>`,
    );
  }

  const body = `<g>${strands.join('')}</g>
<g>${shine.join('')}</g>
<rect x="30" y="0" width="60" height="${TAB_H}" rx="6" fill="rgb(20 23 28)"/>
<rect x="36" y="${TAB_H - 10}" width="48" height="3" rx="1.5" fill="rgb(115 123 135)"/>`;

  // Colgada (abanico del hero) y tumbada (filas de la carta: la pinza queda a la izquierda).
  const hanging = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="none">
${body}
</svg>
`;
  const lying = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${H} ${W}" width="${H}" height="${W}" fill="none">
<g transform="translate(0 ${W}) rotate(-90)">
${body}
</g>
</svg>
`;
  return { hanging, lying };
}

// Hebras horizontales sin costuras (160×40) para la regla horaria de /reservar: solo la forma (negro con opacidad); el color lo pone
// el token del componente al usarlas como máscara.
function hebras() {
  const rand = rng(424242);
  const paths = [];
  for (let i = 0; i < 16; i += 1) {
    const y = 2 + (i / 15) * 36 + (rand() - 0.5) * 1.5;
    const amp = 0.8 + rand() * 2.2;
    const cycles = 1 + Math.floor(rand() * 2); // 1 o 2 ondas por baldosa: empalma por los lados
    const phase = rand() * Math.PI * 2;
    const points = [];
    for (let x = 0; x <= 160; x += 10) {
      points.push(`${x} ${n(y + Math.sin((x / 160) * Math.PI * 2 * cycles + phase) * amp)}`);
    }
    paths.push(
      `<polyline points="${points.join(' ')}" stroke="black" stroke-width="${n(1.1 + rand() * 1.3)}" stroke-linecap="round" stroke-linejoin="round" opacity="${n(0.55 + rand() * 0.45)}"/>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40" width="160" height="40" preserveAspectRatio="none" fill="none">
${paths.join('\n')}
</svg>
`;
}

await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(path.join(OUT, 'hebras.svg'), hebras(), 'utf8');
for (let i = 0; i < SHADES.length; i += 1) {
  const { hanging, lying } = swatch(i);
  await fs.writeFile(path.join(OUT, `muestra-${i + 1}.svg`), hanging, 'utf8');
  await fs.writeFile(path.join(OUT, `muestra-${i + 1}-h.svg`), lying, 'utf8');
}
process.stdout.write(`[gen-swatches] ${SHADES.length * 2} muestras y hebras.svg en public/images/carta/
`);
