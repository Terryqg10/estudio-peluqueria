-- T-012: borrado a petición y retención por anonimización (ADR-0030, RF-09, CA-26, CA-27).

alter table public.appointments add column anonymized_at timestamptz;

alter table public.appointments drop constraint appointments_has_owner;
alter table public.appointments add constraint appointments_has_owner check (
  anonymized_at is not null
  or user_id is not null
  or (guest_name is not null and guest_email is not null and guest_phone is not null)
);

-- Una cita anonimizada no conserva ningún dato personal (la garantía vive en la BD).
alter table public.appointments add constraint appointments_anonymized_has_no_pii check (
  anonymized_at is null
  or (
    user_id is null and guest_name is null and guest_email is null and guest_phone is null
    and consent_at is null and consent_version is null
  )
);

-- Trabajo común. Sin permisos para nadie: solo la llaman las funciones de abajo.
-- Anonimiza las citas de una persona: una cuenta (p_user_id) o una invitada (p_guest_email).
-- Las citas activas y futuras se cancelan para liberar el hueco. Devuelve cuántas citas cambia.
create function public.anonymize_person(p_user_id uuid, p_guest_email text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_guest_email, '')));
  v_ids uuid[];
  v_count integer;
begin
  if (p_user_id is null) = (v_email = '') then
    raise exception 'INVALID_INPUT';
  end if;

  select coalesce(array_agg(a.id), '{}') into v_ids
  from public.appointments a
  where a.anonymized_at is null
    and case
      when p_user_id is not null then a.user_id = p_user_id
      else a.user_id is null and lower(a.guest_email) = v_email
    end;

  delete from public.appointment_tokens t where t.appointment_id = any(v_ids);
  delete from public.appointment_notes n where n.appointment_id = any(v_ids);

  update public.appointments a
  set status = case
        when a.status in ('confirmed', 'pending') and lower(a.during) > now() then 'cancelled'::public.appointment_status
        else a.status
      end,
      user_id = null,
      guest_name = null,
      guest_email = null,
      guest_phone = null,
      consent_at = null,
      consent_version = null,
      anonymized_at = now(),
      updated_at = now()
  where a.id = any(v_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.anonymize_person(uuid, text) from public, anon, authenticated, service_role;

-- Borrado de una cuenta (CA-26). Anonimiza sus citas y limpia el perfil; después la aplicación
-- elimina el usuario de Auth (hay que anonimizar antes: `user_id` pasaría a null y la restricción
-- de dueño lo impediría). Idempotente.
create function public.delete_account_data(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_user_id is null then
    raise exception 'INVALID_INPUT';
  end if;
  v_count := public.anonymize_person(p_user_id, null);
  update public.profiles p set full_name = null, phone = null where p.id = p_user_id;
  return v_count;
end;
$$;

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;

-- Borrado de una invitada con el token de su cita (CA-26). Valida el token como
-- `cancel_guest_appointment` (misma respuesta para forma errónea, desconocido o caducado) y
-- anonimiza todas las citas de ese email. El token deja de valer.
create function public.delete_guest_data(p_token text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'INVALID_TOKEN';
  end if;

  select lower(a.guest_email) into v_email
  from public.appointment_tokens t
  join public.appointments a on a.id = t.appointment_id
  where t.token_hash = extensions.digest(p_token, 'sha256')
    and t.expires_at > now()
    and a.user_id is null
    and a.guest_email is not null;

  if v_email is null then
    raise exception 'INVALID_TOKEN';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('booking-email:' || v_email, 0));
  return public.anonymize_person(null, v_email);
end;
$$;

revoke all on function public.delete_guest_data(text) from public;
grant execute on function public.delete_guest_data(text) to anon, authenticated;

-- Retención (CA-27). Anonimiza a la persona cuya ÚLTIMA cita empezó hace más de p_months meses:
-- una cita reciente o futura protege todo su histórico. Limpia el perfil de esas cuentas (la
-- cuenta de Auth se conserva) y purga los registros de límites de más de 24 h.
create function public.anonymize_expired_data(p_months integer default 24)
returns table (appointments_anonymized integer, profiles_cleared integer, rate_limits_purged integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz;
  v_appointments integer := 0;
  v_profiles integer := 0;
  v_limits integer := 0;
  v_n integer;
  r record;
begin
  if p_months is null or p_months not between 1 and 120 then
    raise exception 'INVALID_INPUT';
  end if;
  v_cutoff := now() - make_interval(months => p_months);

  for r in
    select a.user_id
    from public.appointments a
    where a.user_id is not null
    group by a.user_id
    having max(lower(a.during)) < v_cutoff
  loop
    v_appointments := v_appointments + public.anonymize_person(r.user_id, null);
    update public.profiles p set full_name = null, phone = null
    where p.id = r.user_id and (p.full_name is not null or p.phone is not null);
    get diagnostics v_n = row_count;
    v_profiles := v_profiles + v_n;
  end loop;

  for r in
    select lower(a.guest_email) as email
    from public.appointments a
    where a.user_id is null and a.guest_email is not null and a.anonymized_at is null
    group by lower(a.guest_email)
    having max(lower(a.during)) < v_cutoff
  loop
    perform pg_advisory_xact_lock(hashtextextended('booking-email:' || r.email, 0));
    -- Se vuelve a comprobar con el bloqueo: una reserva simultánea la protege.
    if (
      select max(lower(a.during)) from public.appointments a
      where a.user_id is null and lower(a.guest_email) = r.email and a.anonymized_at is null
    ) < v_cutoff then
      v_appointments := v_appointments + public.anonymize_person(null, r.email);
    end if;
  end loop;

  delete from public.rate_limits l where l.created_at < now() - interval '24 hours';
  get diagnostics v_limits = row_count;

  return query select v_appointments, v_profiles, v_limits;
end;
$$;

revoke all on function public.anonymize_expired_data(integer) from public, anon, authenticated;
grant execute on function public.anonymize_expired_data(integer) to service_role;
