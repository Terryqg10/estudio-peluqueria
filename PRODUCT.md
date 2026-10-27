# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dos lecturas de la misma web, con prioridad confirmada por el usuario (2026-10-27):

1. **Primaria: reclutadores y clientes de Terry (visitantes de terryq.com).** Llegan desde la ficha del portfolio, tienen poco tiempo y deciden en
   segundos si el trabajo es serio. Evalúan oficio de diseño, ingeniería y accesibilidad. Su tarea: entender el proyecto y probar el panel («Probar el panel»).
2. **Secundaria: la clienta del salón ficticio** (mujer que busca peluquería en Madrid, sobre todo en móvil). Quiere ver precios, resultados reales y reservar sin llamar.
3. Personal del salón (dueña o gerente) en el panel de administración; solo existe como demo de solo lectura.

## Product Purpose

Atelier Malva es la web de un único salón de peluquería de mujer, **ficticio**, hecha como proyecto de portfolio con Spec-Driven Development. Permite reservar cita con
disponibilidad en tiempo real y sin dobles reservas, gestionar la cita por enlace o con cuenta, y administrar agenda, servicios, horarios y bloqueos desde un panel.
Éxito: que quien la visita perciba un producto real y cuidado y complete el recorrido (ver servicios y trabajos, reservar, entrar a la demo del panel).

## Positioning

Junta lo que hoy está separado en el sector: **precio claro y reserva directa con disponibilidad real** (lo de los marketplaces) con **resultados y equipo reales de un único
salón** (lo de las cadenas). Un marketplace no puede enseñar el trabajo propio de un salón concreto; una cadena no publica precios «desde» ni reserva en vivo por estilista.
Confirmado por el usuario.

## Operating Context

Reserva en 4 pasos (servicio → estilista, día y hora → datos → confirmación por email). Gestión de la cita por enlace personal sin cuenta o con cuenta por enlace mágico
(sin contraseña). Panel `/admin` con agenda semanal por estilista. Chat de ayuda de reglas (sin IA) con enlace a WhatsApp. El salón, sus datos, las citas y las estilistas
son datos de semilla ficticios (marcados VERIFICAR en `src/lib/site.ts`).

## Capabilities and Constraints

- Next.js 16 (App Router), React 19, TypeScript estricto, Tailwind 4 con tokens y paleta validada; Supabase (Postgres, Auth, Realtime) con RLS; Vercel. Demo en
  https://estudio-peluqueria.vercel.app. Estilo `v5-color-chart@0.1.0` (estilo del proyecto, ADR-0040; sustituye a `v1-soft-commerce@0.5.0`), según PLAN-001; las reglas del proyecto están en `.claude/` y `docs/constitution.md`.
- Invariantes del proyecto que cualquier diseño debe respetar: WCAG AA como suelo, `prefers-reduced-motion` con alternativa estática, responsive de 320 a 1280 px sin
  desbordes, solo tokens (sin hex ni valores arbitrarios), sin inventar datos, precios, reseñas ni claims.
- La reserva (`/reservar`) exige JavaScript por la disponibilidad en vivo; el resto degrada sin JS.
- Sin pagos, sin tienda, sin newsletter, sin reseñas hasta que existan verificadas (spec, «Fuera de alcance»).
- Estado de decisión: el usuario declara que **todo es modificable** en el rediseño de la Home (nombre, copy, imágenes, estructura y apariencia); lo visual se decide en new-work.

## Brand Commitments

Ninguna intocable, por decisión del usuario (2026-10-27). Estado actual tras T-041, solo como evidencia: nombre «Atelier Malva» (provisional, VERIFICAR que no coincide con un negocio
real), «Peluquería de mujer», titulares Bricolage Grotesque + cuerpo Geist, semilla de paleta cobre `#B5401C` (antes: Fraunces y malva `#A8456A`). El sistema visual vigente está en `DESIGN.md`.

## Evidence on Hand

- Catálogo ficticio de servicios con precios «desde» y duración (semilla), 3 estilistas ficticias, 48 citas de ejemplo en la demo.
- Imágenes: foto `public/images/hero-inicio.jpg` (ya no se usa en la Home tras T-041) (Pexels, «Curly Haired Woman with Crocodile Hair Clip», RDNE Stock project) y 7 trabajos antes/después **generados con IA** en
  `public/images/galeria/` (registro en `docs/imagenes.md`; se señalan como imagen generada con IA).
- Capturas de la portada y del panel en `docs/img/`.
- Ausencias que no hay que fabricar: reseñas, testimonios, premios, fotos reales del salón y del equipo, dirección y teléfono reales.

## Product Principles

1. **Precio y disponibilidad visibles antes de pedir nada**: el valor diferencial es la claridad, no la persuasión.
2. **Lo real por delante**: trabajos, equipo y huecos reales; nada inventado, y la IA y la demo se declaran.
3. **La ingeniería se nota en el detalle, no en el discurso**: rápido, accesible, sin sorpresas; el oficio demuestra el nivel.
4. **Reservar es una acción de dos toques en móvil**: cualquier diseño que añada pasos antes de reservar paga el precio.

## Accessibility & Inclusion

WCAG AA como suelo (axe en CI), `prefers-reduced-motion` con alternativa estática, áreas táctiles de 44×44 px, texto de al menos 12 px, foco visible y español como único idioma.
