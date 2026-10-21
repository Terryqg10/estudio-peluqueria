---
id: ADR-0025
title: CI bloqueante en GitHub Actions — Supabase local en el runner, audit con lista blanca y e2e en 4 fragmentos
status: aceptada
date: 2026-10-21
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0008, ADR-0023, ADR-0024, T-013a]
---

# ADR-0025 — CI bloqueante en GitHub Actions

## Contexto

RNF-09 exige una CI bloqueante en GitHub Actions con tipos, lint, unitarios, integración con BD real, build,
gitleaks y audit. Hasta ahora las puertas se corrían a mano (unos 8 minutos y muchos tokens por tarea). El repo
trajo de la plantilla un `ci.yml` que **fallaba en 10 s** (pedía un `.node-version` inexistente) y que, aunque
hubiera arrancado, no tenía Supabase, así que no podía ejecutar la integración ni los e2e, que necesitan BD,
Auth y Realtime. Había tres decisiones: de dónde sale la BD en la CI, cómo se aplica la regla de ADR-0008 y
ADR-0023 («cualquier hallazgo nuevo bloquea») y cómo repartir el e2e.

## Alternativas consideradas

**Base de datos de la CI**
1. **Proyecto Supabase en la nube dedicado a pruebas, con secretos de GitHub** — más parecido a producción,
   pero exige crear y mantener un proyecto, guarda claves en el repo de GitHub, y los jobs en paralelo y las
   ramas compartirían datos. Se descarta.
2. **Simular Supabase con mocks** — no ejercita RLS, Realtime, funciones ni la restricción de exclusión, que es
   justo lo que protegen las pruebas de integración. Se descarta.
3. **`supabase start` dentro del runner (elegida)** — mismas migraciones y seed que en local, sin secretos y con
   aislamiento total por job.

**Regla del audit**
4. **Solo `pnpm audit --prod` bloqueante y el completo informativo** — fácil, pero deja de aplicar «hallazgo
   nuevo bloquea» y una vulnerabilidad nueva en una devDependency pasaría sin que nadie la vea. Se descarta.
5. **`pnpm audit` completo bloqueante** — rojo desde el primer día por los 13 hallazgos ya aceptados. Se
   descarta.
6. **Script con lista blanca por id y paquete (elegida)** — producción sin ningún hallazgo; en el completo, solo
   los 13 de ADR-0008 y ADR-0023; todo high o critical nuevo bloquea.

**Reparto del e2e**
7. **Un solo job** — con `CI=true` Playwright usa 1 worker y el e2e (575 tests, escritorio y móvil) sería
   largo (estimación, no medida). Se descarta.
8. **4 fragmentos en paralelo (elegida, `--shard`)** — medido: de 1 a 4 minutos de tests por fragmento.

## Decisión

- **Workflow `.github/workflows/ci.yml`**, disparado en `push` a `main`, en `pull_request` y a mano
  (`workflow_dispatch`), con `concurrency` que cancela la ejecución anterior de la misma rama. Sin secretos de
  GitHub; permisos `contents: read`.
- **Jobs en paralelo:** `quality` (tipos, lint, paleta, audit, unitarios, build), `secrets` (gitleaks),
  `integration` (Supabase local + `pnpm test:integration`) y `e2e` (4 fragmentos). **`ci-ok`** agrega los
  resultados y es el que debe marcarse como comprobación obligatoria de la rama.
- **Supabase local en el runner** con la CLI fijada a la misma versión que en desarrollo (2.118.0) y sin los
  servicios que la web no usa (`storage-api, imgproxy, studio, edge-runtime, logflare, vector, supavisor,
  postgres-meta`). `scripts/ci-supabase-env.mjs` exporta la URL y las claves de demostración del Supabase local a
  `$GITHUB_ENV` (enmascaradas); no hay secretos reales ni escritura en el repo.
- **Audit (`scripts/check-audit.mjs`, `scripts/audit-allowlist.json`)**:
  1. **Producción:** ningún hallazgo, la lista blanca no cuenta.
  2. **Completo:** falla ante un hallazgo high o critical que no esté en la lista blanca; los moderate o low
     nuevos avisan. La clave es **id + paquete** (un mismo aviso puede afectar a dos paquetes).
  3. **Sin evidencia, sin visto bueno:** si no se puede leer el JSON del audit, la puerta falla.
  4. La lista blanca contiene exactamente los 13 de ADR-0008 (10) y ADR-0023 (3) y **debe quedar vacía al
     cerrar T-016**, que es su caducidad.
- **gitleaks:** se mantiene la acción de la plantilla y el `.gitleaks.toml` del proyecto. La CI usa gitleaks 8.24
  y marcaba como `generic-api-key` un token de **prueba** de 43 caracteres de dos tests unitarios (el 8.30 local,
  no). Se permite **solo ese valor exacto**, no los archivos.
- **e2e de «cambiar la cita con menos de 24 h»** (CA-14): bloquea el canal en tiempo real. Con él, el aviso de la
  BD hacía que la página recargase la disponibilidad, el servidor respondiese `TOO_LATE` y el botón «Confirmar
  el cambio» desapareciese **a propósito** antes del clic; el test dependía de la velocidad de la máquina
  (pasaba en local, fallaba en el runner). El CA no cambia, solo el método de verificación del e2e; el CA-14
  sigue verificado también por `ventana-24h` (integración).
- **Dependabot** (de la plantilla) se mantiene tal cual; sus PRs se revisan y fusionan a mano.

## Consecuencias

- Positivas: cada push y cada PR ejecuta la batería completa sin gastar tokens de la sesión; el rojo se ve en
  GitHub; el audit sigue aplicando la regla de los ADR en vez de ignorarla.
- Negativas y riesgos:
  - **Límite de descargas de imágenes Docker.** Los 5 jobs con Supabase bajan las mismas imágenes de
    `public.ecr.aws` a la vez y se observó `toomanyrequests: Rate exceeded` hasta 21 veces en un job. La CLI
    **reintenta sola** y todos terminaron bien, pero puede alargar o, en el peor caso, tumbar un job. Si llegase a
    fallar, la salida es una caché de imágenes o menos fragmentos.
  - **Acciones fijadas por versión mayor** (`@v4`, `@v2`…), no por SHA: un compromiso del repositorio de una
    acción llegaría a la CI. Mitigación parcial: Dependabot las vigila. VERIFICAR fijarlas por SHA antes de
    publicar.
  - **«Bloquea la fusión» (RNF-09) requiere un ajuste de GitHub que no está en el repo:** proteger `main` y marcar
    `CI OK` como comprobación obligatoria. Lo debe hacer la persona propietaria del repositorio.
  - Cada ejecución consume minutos de GitHub Actions (7 jobs; unos 7 minutos de reloj en la primera ejecución
    verde). Si el repo es privado cuenta contra la cuota mensual.
  - Los fallos se pueden deber a diferencias Linux frente a Windows (se ejecutan en Ubuntu; el desarrollo es en
    Windows): la primera ejecución destapó dos, resueltas aquí.
- **Coste de revertir: bajo.** Es un archivo de workflow y dos scripts; los tests no dependen de la CI.

## Relación con la constitución

- I4 (sin secretos: claves del Supabase local enmascaradas, nada en el repo, gitleaks bloqueante), I8 (scripts en
  Node, sin sh/bash; el único uso de `shell` es lanzar `pnpm` en Windows con una cadena fija), I9 (evidencia
  automática de las puertas). No modifica `docs/constitution.md`.
