# docs/publicacion.md — Guía de publicación (repo, Supabase alojado, Vercel)

Pasos que hace la persona propietaria en los paneles de cada servicio; Claude Code no tiene acceso a ellos.
Marcas **VERIFICAR**: confirmar en la documentación o el panel vigente (planes, límites y menús cambian).
Ninguna clave se pega en el repo ni en el chat (invariante I4): van a Supabase, Vercel y GitHub Secrets.

## Estado de partida

- Repositorio: `Terryqg10/estudio-peluqueria` (público), rama `main`, CI de T-013a activa.
- Bloquea **publicar de verdad** (no el despliegue de prueba): contenido real y textos legales (hallazgos 1 y 2 de
  `sdd/reviews/revisar-2026-10-23.md`). Hasta entonces, desplegar solo como entorno de prueba y no difundir la URL.

## 1. Supabase alojado

1. Crear el proyecto en supabase.com (región de la UE, p. ej. Frankfurt, por RGPD; **VERIFICAR** plan gratuito y
   límites). Guardar la contraseña de la BD en el gestor de contraseñas.
2. Vincular y aplicar las migraciones (las 19 de `supabase/migrations/`, en orden; requiere la CLI de Supabase,
   la misma versión que la CI, 2.118.0):

   ```bash
   supabase login
   supabase link --project-ref <ref-del-proyecto>
   supabase db push
   ```

3. **No** cargar `supabase/seed.sql` tal cual: trae datos de ejemplo (servicios, estilistas, galería provisional).
   Cargar solo el catálogo real cuando exista (servicios, estilistas, horarios) desde el panel Admin o un SQL propio.
4. Auth → URL Configuration: *Site URL* = URL de producción de Vercel y, en *Redirect URLs*, la misma URL con
   `/**` (los enlaces mágicos vuelven a `/acceso/confirmar`). **VERIFICAR** que las plantillas de email de
   `supabase/templates/` coinciden con las del proyecto alojado (se configuran en el panel o con `config.toml`).
5. Auth → Rate limits y SMTP: el SMTP integrado de Supabase está muy limitado; para el enlace mágico configurar un
   SMTP propio (p. ej. Resend) en Auth → SMTP Settings. **VERIFICAR** cuotas.
6. Anotar (Project Settings → API): URL del proyecto, clave `anon` (pública) y clave `service_role` (**secreta**,
   solo servidor).

## 2. Resend (emails de la web)

1. Crear cuenta y **verificar un dominio** para poder enviar a cualquier destinatario (**VERIFICAR**: sin dominio
   verificado Resend solo permite enviar a la propia cuenta). Sin dominio propio, dejar los emails sin probar en
   producción y no anunciar la reserva.
2. Crear una API key con permiso de envío. Remitente, p. ej., `Estudio <citas@tu-dominio>`.

## 3. Vercel

1. Importar el repo `estudio-peluqueria` (framework Next.js; pnpm se detecta por `pnpm-lock.yaml`).
2. Settings → Environment Variables, entorno *Production* (marcar *Sensitive* las secretas):

   | Variable | Valor | Pública |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | sí, por diseño |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clave `anon` | sí, por diseño |
   | `SUPABASE_SERVICE_ROLE_KEY` | clave `service_role` | **no**, solo servidor |
   | `RATE_LIMIT_SALT` | cadena aleatoria de ≥ 16 caracteres (**obligatoria** en producción) | no |
   | `EMAIL_PROVIDER` | `resend` | no |
   | `EMAIL_FROM` | remitente con dominio verificado | no |
   | `RESEND_API_KEY` | clave de Resend | **no** |
   | `APP_URL` | URL pública con `https://` (los enlaces de los emails salen de aquí, no de `Host`) | no |

   Generar `RATE_LIMIT_SALT` con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   No usar los mismos valores que en desarrollo.
3. Los *Preview* deployments **no** deben tener la clave `service_role` de producción (fuga típica de costes y datos,
   `rules/security.md`): dejarlas solo en *Production*.
4. Desplegar y abrir la URL; comprobar `/`, `/reservar` y `/acceso`.

## 4. Primer Admin

1. Entrar una vez en `/acceso` con el email de la propietaria (llega el enlace mágico).
2. Dar el rol desde el ordenador, con las variables en el entorno de la sesión (no en un archivo del repo):

   ```bash
   pnpm admin:promote <email>
   ```

## 5. Retención de datos (CA-27)

`scripts/retention.mjs` anonimiza a quien lleva más de 24 meses sin citas (ADR-0030). Hay que ejecutarlo de forma
periódica contra producción (cron en GitHub Actions con secretos, o manual cada mes): **decisión pendiente**.

## 6. Keep-alive de Supabase (T-013b)

Cuando existan el proyecto alojado y los secretos de GitHub (Settings → Secrets and variables → Actions:
`SUPABASE_URL` y `SUPABASE_ANON_KEY`, ambos públicos por diseño), se completa T-013b: workflow semanal con
`workflow_dispatch`. Qué petición cuenta como actividad para evitar la pausa es **VERIFICAR** (RNF-10).

## 7. Protección de la rama

Settings → Branches → regla sobre `main`: exigir la comprobación «CI OK» (ADR-0025). Configuración de GitHub, no del
repo.

## Lista de comprobación antes de difundir la URL

- [ ] Contenido real (imágenes y datos del salón) y textos legales publicados.
- [ ] Reserva de prueba completa en producción y email recibido.
- [ ] Topes de coste y alertas configurados (`docs/costs.md`: Resend, Supabase, Vercel).
- [ ] Copia de seguridad: `docs/backups.md`.
- [ ] `pnpm audit --audit-level=high` y gitleaks limpios.
