---
id: ADR-0012
title: Titulares en serif (Fraunces) frente a Geist para el texto
status: aceptada
date: 2026-10-19
os_version: 0.6.0
relates_to: [PLAN-001-peluqueria-reservas, T-003]
---

# ADR-0012 — Titulares en serif (Fraunces) frente a Geist para el texto

(Corresponde al «ADR-D» del plan.)

## Contexto

La dirección visual aprobada es «minimalista editorial suave», con un titular
serif de contraste frente a Geist. El estilo v1 usa Geist como fuente de marca
(`--font-brand`) y no define una fuente de titulares. Hace falta fijar cuál y
cómo se carga, sin romper el contrato de tokens ni el rendimiento.

## Alternativas consideradas

1. **Solo Geist** — cero coste, pero sin el carácter editorial pedido.
2. **Fraunces (elegida)** — serif variable con carácter cálido y buen
   contraste con Geist; disponible en Google Fonts y cargable con `next/font`.
3. **Playfair Display** — muy habitual en moda y belleza, pero más vista;
   menos distintiva.
4. **Cormorant Garamond** — muy elegante, pero muy fina y menos legible en
   tamaños pequeños en móvil.

## Decisión

- Titulares (`h1`, `h2` de sección y números destacados) en **Fraunces**;
  texto, navegación, formularios y controles siguen en **Geist**.
- Se carga con `next/font/google` (autoalojada en la build, sin petición a
  Google en tiempo de ejecución), como variable CSS `--font-display`, con
  `display: swap` y un subconjunto latino. VERIFICAR que la fuente está
  disponible en la versión de Next del proyecto.
- Se mapea a una utilidad de Tailwind `font-display` en `globals.css`; los
  componentes usan solo esa utilidad, sin nombres de fuente literales.
- Se evita cargar pesos o ejes que no se usen (presupuesto de rendimiento).
- No se modifican los tokens de v1 (`tokens.css` es inmutable para un estilo
  aprobado); la fuente de titulares es una decisión de proyecto, no del estilo.

## Consecuencias

Positivas:
- El hero gana carácter editorial sin tocar el sistema de tokens.
- Se mantienen los tamaños con `--text-display` (`clamp`).

Negativas:
- Una fuente más: peso extra y posible CLS si no se precarga bien (se verifica
  con Lighthouse en T-003).
- Una decisión de proyecto que se aparta de la tipografía por defecto del
  estilo; queda registrada aquí.

## Relación con la constitución

- I6 (accesibilidad): tamaños mínimos y contraste siguen cubiertos por tokens.
- No modifica `docs/constitution.md` ni el estilo v1.
