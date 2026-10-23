#!/usr/bin/env node
// Genera las ilustraciones PROVISIONALES de la galería antes/después (T-011) con Chromium de Playwright
// (ya es dependencia de desarrollo). No son fotos: son formas y degradados rotulados «Imagen provisional».
// Se sustituyen por las imágenes generadas con IA según docs/imagenes.md. Uso: node scripts/make-gallery-placeholders.mjs

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'images', 'galeria');
const WIDTH = 1200;
const HEIGHT = 900;

// slug → tono (0–360) de la ilustración. Los nombres siguen el plan: galeria-<tecnica>-<n>-antes/despues.
const PAIRS = [
  ['balayage', 1, 28],
  ['balayage', 2, 18],
  ['mechas', 1, 40],
  ['color', 1, 345],
  ['corte', 1, 300],
  ['corte', 2, 280],
  ['peinado', 1, 330],
  ['tratamiento', 1, 190],
];

function html(label, hue, after) {
  const sat = after ? 62 : 14;
  const light1 = after ? 78 : 80;
  const light2 = after ? 58 : 62;
  return `<!doctype html><html><body style="margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;font-family:Georgia,serif">
<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;
background:linear-gradient(160deg,hsl(${hue} ${sat}% ${light1}%),hsl(${hue} ${sat}% ${light2}%))">
<svg width="360" height="360" viewBox="0 0 120 120" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="3" stroke-linecap="round">
<path d="M60 14c-18 0-30 14-30 32 0 14 6 22 6 34 0 10-6 18-6 26M60 14c18 0 30 14 30 32 0 14-6 22-6 34 0 10 6 18 6 26"/>
<path d="M44 40c8 6 24 6 32 0M48 60c6 4 18 4 24 0" ${after ? 'stroke-dasharray="2 7"' : ''}/>
</svg>
<div style="font-size:84px;letter-spacing:6px;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,0.25)">${label}</div>
<div style="font-size:28px;letter-spacing:3px;color:rgba(255,255,255,0.92)">IMAGEN PROVISIONAL</div>
</div></body></html>`;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    for (const [slug, n, hue] of PAIRS) {
      for (const [suffix, label, after] of [
        ['antes', 'ANTES', false],
        ['despues', 'DESPUÉS', true],
      ]) {
        await page.setContent(html(label, hue, after));
        const file = path.join(OUT, `galeria-${slug}-${n}-${suffix}.jpg`);
        await page.screenshot({ path: file, type: 'jpeg', quality: 70 });
        process.stdout.write(`[gallery] ok ${path.relative(ROOT, file)} (${Math.round(fs.statSync(file).size / 1024)} KB)\n`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`[gallery] x ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
