---
id: ADR-0038
title: Páginas de «aviso de demostración» y «privacidad» transparentes y avisos de datos ficticios, en lugar de textos legales de un negocio
status: aceptada
date: 2026-10-24
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0036, T-030]
---

# ADR-0038 — Páginas de demostración y avisos de datos ficticios

## Contexto

La spec (sección 9) decía que los textos legales requieren asesoría y que, mientras no existan, las páginas legales no se
enlazan. El proyecto es una **demo de portfolio** (ADR-0036), no un negocio: no hay un salón, un responsable del tratamiento
real ni citas reales. Pero los formularios recogen nombre, email y teléfono, y un visitante podría escribir los suyos reales. Hay
que explicar con exactitud qué guarda la demo, y avisar de que se usen datos ficticios.

## Alternativas consideradas

1. **Textos legales completos de plantilla (aviso legal, política de privacidad, cookies)** — simulan un negocio que no existe y
   serían textos legales inventados sin asesoría. Se descarta (spec, sección 9: «no se inventan términos»).
2. **Solo una línea de «datos ficticios» en el pie** — no explica qué se guarda ni cómo borrarlo mientras los formularios piden
   datos personales. Se descarta.
3. **Dos páginas transparentes de demo y avisos en los formularios (elegida).**

## Decisión

- `/aviso-legal` pasa a llamarse **«Aviso de demostración»** (se conserva la ruta): dice que es un proyecto de portfolio, que
  el salón, sus datos y sus citas son ficticios, que no se atienden reservas reales, quién lo hace (con enlace al portfolio) y
  que las imágenes de la galería son ilustraciones o imágenes generadas con IA.
- `/privacidad` describe **solo lo que la demo hace de verdad**, tomado de la sección 9 de la spec: qué datos se guardan, para
  qué, dónde, cuánto tiempo y cómo se borran (con el enlace a `/borrar-datos`); proveedores (Supabase, Vercel y, si se envían
  emails, Resend); cookies (solo funcionales); la cuenta demo; y que no es asesoramiento legal.
- Ambas se enlazan desde el pie y desde el formulario de reserva (junto al consentimiento, **sin cambiar** su texto ni su
  versión).
- **Avisos de datos ficticios**: una línea de demo en el pie de todas las páginas y un aviso visible en `/reservar`, `/acceso` y
  `/borrar-datos` («Es una demo: usa datos ficticios, por ejemplo un email inventado»).
- Todo texto con dudas legales queda marcado **VERIFICAR**; no se afirma nada que el sistema no haga.

## Consecuencias

Positivas:
- La demo es honesta con quien la usa y cumple lo que la spec ya prometía (datos documentados, borrado a petición).
- Sin cláusulas legales inventadas ni aparentar un negocio real.

Negativas:
- No sustituyen a unos textos legales revisados: si algún día el proyecto fuera un negocio real, habría que rehacerlos con
  asesoría.
- Mantener dos textos sincronizados con la realidad (cada cambio en los datos que se guardan exige actualizar `/privacidad`; ya
  lo pide la sección 9).

## Relación con la constitución

I6 (contraste y áreas táctiles), I5 (los textos describen validaciones reales), I9 (CA con tests). Spec, sección 9: «esta sección se
actualiza si se tocan datos personales».
