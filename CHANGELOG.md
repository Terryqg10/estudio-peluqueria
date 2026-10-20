# Changelog — peluqueria

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/)
y versionado [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Añadido
- T-001: base de la interfaz con cabecera sticky, navegación, menú móvil sin JavaScript
  (`:target` y `useHashOverlay`), pie y página `/contacto`. Paleta `#A8456A` validada.
- T-002: Supabase local con esquema de reservas, restricción anti-solape (`tstzrange`), RLS en
  todas las tablas, acceso de invitada por token de 256 bits guardado como hash, semilla
  ficticia, tipos generados y 39 tests de integración. ADR-0009 y ADR-0010.
- T-003: home con hero (imagen AVIF/WebP responsive), servicios con precio «desde» leídos de la
  BD, contacto y titulares en Fraunces. Barrido de anchos y axe sobre todas las páginas
  públicas, y test de imágenes responsive. ADR-0011 y ADR-0012.
- T-004: tabla `stylist_services`, función `get_availability` (huecos cada 15 min en
  `Europe/Madrid`, sin solapes ni bloqueos) y aviso de cambio de disponibilidad por Realtime sin
  datos personales; contrato Zod `getAvailability()` y 19 tests nuevos. ADR-0013 y ADR-0014.
- T-005a: página `/reservar` con selección de servicio, estilista, día (tira de 14 a 60 días) y hora,
  con disponibilidad en vivo (Realtime y sondeo de respaldo), aviso si otra persona ocupa tu hueco y
  búsqueda de próximos días. Botón «Reservar» en la cabecera y por servicio en la home. El flujo
  termina en el resumen; la confirmación llega con T-005b.
- T-005b: reserva de invitada de extremo a extremo. Función de BD `create_booking` (solo `service_role`,
  restricción anti-solape como árbitra), formulario «Tus datos» con consentimiento (fecha y versión) y
  honeypot, página `/reservar/confirmada` sin datos personales y cookie de confirmación `httpOnly`.
  Requiere `SUPABASE_SERVICE_ROLE_KEY` (solo servidor). ADR-0015 y ADR-0016. Aún sin email (T-006) ni
  límites de citas (T-005c).
- T-006a: email de confirmación tras reservar con un enlace personal `/cita/<token>` de solo lectura.
  Adaptador `EmailSender` sin dependencias nuevas (Mailpit local y Resend por variable de entorno), la
  cita se mantiene si falla el envío y la confirmación avisa. Enlace con un único mensaje de «no válido
  o caducado». ADR-0017 y ADR-0018. Aún sin cancelar ni cambiar la cita (T-006b).
- Registro de imágenes en `docs/imagenes.md` y Lighthouse como devDependency.

### Cambiado
- Spec `SPEC-001` aprobada y enmendada (estados de cita, token de invitada, RNF-13, CA-36 y
  CA-37). Plan `PLAN-001` aprobado.

### Seguridad
- ADR-0008: excepción con caducidad de `pnpm audit` para devDependencies de la plantilla.

## [0.1.0] — YYYY-MM-DD

### Añadido
- Instanciado desde web-os.
- Constitución del OS.
- Estructura SDD.
- Estilos disponibles v1-v4.
- Plantilla de Next.js, TypeScript, Tailwind, Motion.
- CI mínima (typecheck, lint, tests, build, gitleaks, audit).
