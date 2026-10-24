---
id: ADR-0037
title: Keep-alive de Supabase diario, con lecturas reales de la Data API y sin instalar dependencias
status: aceptada
date: 2026-10-24
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0025, T-013b]
---

# ADR-0037 — Keep-alive diario de Supabase

## Contexto

RNF-10 y CA-35 piden un workflow **semanal** que consulte la BD para que Supabase no pause el proyecto gratuito, y dejan
como **VERIFICAR** qué cuenta como actividad. La documentación oficial
([Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)) dice que un proyecto gratuito se pausa si
no recibe «actividad de base de datos de usuario suficiente» en una semana y que «unas pocas peticiones de usuario a la base de
datos cada día» bastan; recomienda generar actividad con llamadas a la API. No publica un umbral exacto, y una sola petición a
la semana está justo en el borde. El proyecto es una demo de portfolio: una pausa el día que la abre alguien es el peor caso.

## Alternativas consideradas

1. **Una petición por semana (lo que dice RNF-10)** — mínimo coste, pero sin margen respecto al umbral no publicado. Se descarta.
2. **Healthcheck de Auth** — hay indicios de que no cuenta como actividad de BD. Se descarta.
3. **`pg_cron` dentro de Supabase** — cuenta como actividad, pero añade una extensión y una migración a una demo, y no sale del
   propio proyecto (si algo falla, no avisa). Se descarta.
4. **GitHub Actions diario con 3 lecturas reales de la Data API (elegida).**

## Decisión

- Workflow `.github/workflows/keep-alive.yml`: `schedule` **diario** (más `workflow_dispatch` para probarlo sin esperar),
  que ejecuta `scripts/keep-alive.mjs` (Node, solo `fetch`, sin instalar dependencias).
- Cada ejecución hace **3 lecturas** con la clave pública (`anon`) por PostgREST a tablas de catálogo (`services`,
  `stylists`, `salon_hours`): peticiones de usuario a la BD, sin escrituras ni datos personales.
- La URL y la clave pública viven en **GitHub Secrets** (`SUPABASE_URL`, `SUPABASE_ANON_KEY`); nunca en el repo. El script no
  imprime la clave. Ambos valores son públicos por diseño (van en el navegador), pero se tratan como configuración.
- Si una lectura falla (respuesta no 2xx, error de red o tabla vacía), el script termina con error y el workflow falla; GitHub
  avisa por email de los fallos de un workflow programado.
- Enmienda de la spec: RNF-10 y CA-35 pasan de «semanal» a «diario».

## Consecuencias

Positivas:
- Margen frente al umbral no publicado; coste cero (unos segundos de Actions al día).
- Detecta también que el proyecto responde (BD y Data API) cada día.

Negativas:
- GitHub desactiva los workflows programados de un repositorio **público** sin actividad durante 60 días (**VERIFICAR** en la
  documentación de GitHub): hay que tocar el repo de vez en cuando o reactivar el workflow.
- Qué cuenta como actividad sigue sin ser un contrato de Supabase; si pausaran igualmente, se restaura desde el panel o se
  pasa a un plan de pago (los proyectos de pago no se pausan).
- El keep-alive no es un uso explícitamente soportado por Supabase (**VERIFICAR** sus términos).

## Relación con la constitución

I4 (secretos fuera del repo), I8 (script en Node, sin sh/bash), I9 (CA-35 con test y revisión documentada).
