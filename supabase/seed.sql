-- Semilla de desarrollo (T-002). TODO es dato ficticio: VERIFICAR y sustituir
-- cuando el negocio sea real. Sin citas, sin cuentas y sin datos personales.
-- Coherente con src/lib/site.ts y PLAN-001 (datos de prueba).

-- Estilistas ficticias. -- VERIFICAR: nombres, no deben coincidir con personas reales
insert into public.stylists (name, specialty, bio) values
  ('Lucía Marín',  'Color, mechas y balayage',   'Especialista en color. Dato de ejemplo.'),   -- VERIFICAR
  ('Carmen Ortega', 'Corte y peinado',            'Especialista en corte. Dato de ejemplo.'),   -- VERIFICAR
  ('Irene Solís',  'Tratamientos y eventos',     'Especialista en tratamientos. Dato de ejemplo.'); -- VERIFICAR

-- Servicios: precios "desde" (céntimos) y duración estimada. -- VERIFICAR: todo ficticio
insert into public.services (category, name, price_from_cents, duration_min, sort_order) values
  ('Corte y peinado', 'Corte mujer',               2500,  45, 10),
  ('Corte y peinado', 'Peinado',                   2000,  30, 20),
  ('Corte y peinado', 'Peinado de evento',         4500,  60, 30),
  ('Color',           'Color',                     4500,  90, 40),
  ('Color',           'Mechas',                    7000, 150, 50),
  ('Color',           'Balayage',                 11000, 180, 60),
  ('Tratamientos',    'Tratamiento de keratina',   9000, 150, 70),
  ('Tratamientos',    'Tratamiento hidratante',    1800,  30, 80);

-- Qué servicios hace cada estilista (ADR-0014), con solapes para que elegir importe. -- VERIFICAR: ficticio
insert into public.stylist_services (stylist_id, service_id)
select st.id, sv.id
from (values
  ('Lucía Marín',   'Corte mujer'),
  ('Lucía Marín',   'Color'),
  ('Lucía Marín',   'Mechas'),
  ('Lucía Marín',   'Balayage'),
  ('Carmen Ortega', 'Corte mujer'),
  ('Carmen Ortega', 'Peinado'),
  ('Carmen Ortega', 'Peinado de evento'),
  ('Carmen Ortega', 'Color'),
  ('Irene Solís',   'Peinado'),
  ('Irene Solís',   'Peinado de evento'),
  ('Irene Solís',   'Tratamiento de keratina'),
  ('Irene Solís',   'Tratamiento hidratante')
) as m (stylist_name, service_name)
join public.stylists st on st.name = m.stylist_name
join public.services sv on sv.name = m.service_name;

-- Horario del salón. weekday ISO: 1 = lunes ... 7 = domingo. -- VERIFICAR
insert into public.salon_hours (weekday, opens, closes) values
  (1, '10:00', '20:00'),
  (2, '10:00', '20:00'),
  (3, '10:00', '20:00'),
  (4, '10:00', '20:00'),
  (5, '10:00', '20:00'),
  (6, '10:00', '14:00');

-- Horario de cada estilista: el del salón. -- VERIFICAR
insert into public.stylist_schedule (stylist_id, weekday, starts, ends)
select s.id, h.weekday, h.opens, h.closes
from public.stylists s
cross join public.salon_hours h;

-- Galería antes/después (T-011, T-031). Imágenes generadas con IA (docs/imagenes.md): 7 pares WebP cuadrados de 1000×1000 px
-- (scripts/optimize-gallery.mjs). Ficticio: no son trabajos reales. VERIFICAR
insert into public.gallery_items (technique, service_id, stylist_id, before_path, after_path, alt_before, alt_after, ai_generated, sort_order)
select m.technique, sv.id, st.id,
       '/images/galeria/galeria-' || m.slug || '-' || m.n || '-antes.webp',
       '/images/galeria/galeria-' || m.slug || '-' || m.n || '-despues.webp',
       m.alt_before,
       m.alt_after,
       true,
       m.sort_order
from (values
  ('Balayage',    'balayage',    1, 'Balayage',                 'Lucía Marín',   10,
   'Antes: cabello castaño oscuro, largo y de un solo tono, visto de espaldas',
   'Después: el mismo cabello con balayage color miel y caramelo, ondulado y luminoso'),
  ('Mechas',      'mechas',      1, 'Mechas',                   'Lucía Marín',   20,
   'Antes: cabello castaño muy oscuro y liso, sin matices',
   'Después: el mismo cabello con mechas rubio dorado y ondas suaves'),
  ('Color',       'color',       1, 'Color',                    'Carmen Ortega', 30,
   'Antes: cabello de color naranja desigual y apagado',
   'Después: el mismo cabello con color cobrizo uniforme, brillante y ondulado'),
  ('Corte',       'corte',       1, 'Corte mujer',              'Carmen Ortega', 40,
   'Antes: melena larga, lisa y sin forma',
   'Después: la misma melena con corte en capas y ondas, con movimiento'),
  ('Corte',       'corte',       2, 'Corte mujer',              'Carmen Ortega', 50,
   'Antes: melena larga, encrespada y con las puntas abiertas',
   'Después: bob desfilado a la altura de la mandíbula, ligero y ondulado'),
  ('Peinado',     'peinado',     1, 'Peinado de evento',        'Carmen Ortega', 60,
   'Antes: cabello largo, liso y suelto',
   'Después: el mismo cabello peinado con ondas marcadas de estilo clásico para un evento'),
  ('Tratamiento', 'tratamiento', 1, 'Tratamiento de keratina',  'Irene Solís',   70,
   'Antes: cabello encrespado, con volumen y sin brillo',
   'Después: el mismo cabello liso, sedoso y brillante tras el tratamiento de keratina')
) as m (technique, slug, n, service_name, stylist_name, sort_order, alt_before, alt_after)
join public.services sv on sv.name = m.service_name
join public.stylists st on st.name = m.stylist_name;
