-- T-006a / ADR-0018: constancia de si se envió el email de confirmación (nula = no enviado).
-- Solo la escribe service_role: las clientas y el anónimo no tienen UPDATE sobre appointments.
alter table public.appointments
  add column confirmation_email_sent_at timestamptz;
