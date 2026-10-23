---
id: ADR-0036
title: Cuenta demo de solo lectura en el panel Admin, con acceso de un clic y datos personales de visitantes enmascarados en la BD
status: aceptada
date: 2026-10-24
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0022, ADR-0026, ADR-0034, ADR-0020]
---

# ADR-0036 — Cuenta demo de solo lectura

## Contexto

El proyecto es una **demo de portfolio**, no un salón real (decisión de la persona propietaria, 2026-10-24). El panel
Admin es lo más vistoso, pero solo entra quien tiene rol `admin` (ADR-0022), y dar ese rol a visitantes permitiría
modificar o borrar todo y ver los datos personales de cualquiera que haya probado la reserva. Se quiere que un
visitante pueda recorrer el panel sin riesgo y sin pedirle su email (que exigiría un dominio verificado en el proveedor
de correo).

## Alternativas consideradas

1. **Solo capturas o vídeo en la ficha del portfolio** — sin riesgo y sin trabajo, pero no se puede probar. Se descarta
   porque la persona propietaria quiere una demo navegable.
2. **Cuenta demo con rol `admin` y reset programado** — todo funciona de verdad, pero el visitante puede romper los
   datos hasta el siguiente reset y ve los datos personales de otros visitantes. Se descarta.
3. **Rol `demo` de solo lectura, con enmascarado en la BD y acceso de un clic (elegida).**
4. **Acceso por enlace mágico al email del visitante** — reutiliza el acceso actual, pero exige dominio verificado en
   Resend y teclear el email: demasiada fricción para una demo. Se descarta.
5. **Enmascarar solo en la interfaz** — un fallo de interfaz filtraría datos. Se descarta: la garantía vive en la BD
   (como en ADR-0030).

## Decisión

- **Rol `demo`.** Se añade el valor `demo` al enum `user_role`. `is_admin()` sigue siendo verdadero solo para `admin`;
  se añade `is_demo()`. Las políticas de **lectura** de las tablas del panel admiten `is_admin() or is_demo()`;
  ninguna política de insertar, actualizar o borrar admite `demo`, y las funciones `admin_*` comprueban `is_admin()`
  dentro, así que la **BD** impide escribir aunque la interfaz fallase. Nadie puede cambiar un rol desde la web (sin
  cambios).
- **Enmascarado en la BD.** Las citas llevan una marca `is_sample` (de ejemplo, falsa por defecto; la ponen las
  semillas de la demo). Para `demo`, las citas que no son de ejemplo se leen a través de una vista o función de BD
  que devuelve nombre, teléfono, email y nota **enmascarados** (p. ej. «María G.», «•••• 123»); las de ejemplo salen
  completas. `admin` sigue viendo todo. La tabla base de citas no es legible por `demo`.
- **Acceso de un clic.** Con `DEMO_ENABLED=1`, la home pública muestra «Probar el panel»; una **acción de servidor**
  abre la sesión de una **cuenta demo fija** (email no entregable, sin contraseña) usando la clave de servicio solo
  en el servidor (generar el enlace de acceso y canjearlo en el servidor: **VERIFICAR** el API vigente de Supabase
  Auth). El número de entradas está limitado por IP (hash con sal, como ADR-0020) y la sesión caduca pronto (1 hora).
  Sin la variable, la acción y el botón no existen.
- **Interfaz.** El panel muestra un aviso permanente de «Modo demo: solo lectura» y deshabilita (con explicación) las
  acciones de guardar, mover y cancelar. Es ayuda al visitante, no la barrera: la barrera es la BD. Las acciones de
  servidor que escriben devuelven un mensaje de solo lectura, no un 404.
- **Alcance.** La cuenta demo no reserva ni gestiona citas propias. No se guardan datos personales nuevos.

## Consecuencias

Positivas:
- Demo navegable sin riesgo para los datos ni para otros visitantes.
- Garantía en la BD (RLS y vistas), comprobable con pruebas de acceso denegado.
- Sin dominio de correo propio para entrar al panel.

Negativas:
- Una migración con `alter type … add value` (no se puede usar el valor nuevo en la misma transacción: va en una
  migración propia) y vistas o funciones de enmascarado que mantener al añadir columnas personales.
- Cualquiera puede entrar a la demo con un clic: el límite por IP y la caducidad de la sesión acotan el abuso, no lo
  eliminan (riesgo aceptado en una demo).
- La cuenta demo es una cuenta real en Supabase Auth del proyecto alojado; si se comprometiera la clave de servicio
  el problema es mayor que la demo (la clave nunca sale del servidor).
- Revertir es de coste medio: se quita el botón y la variable, y se conserva el valor `demo` del enum (Postgres no
  permite quitar valores de un enum sin recrearlo).

## Relación con la constitución

I3 (RLS antes de consumir datos y prueba de acceso denegado), I4 (la clave de servicio solo en servidor, variable
`DEMO_ENABLED` fuera del repo), I5 (validación Zod en la acción), I9 (CA con tests de integración y e2e).
