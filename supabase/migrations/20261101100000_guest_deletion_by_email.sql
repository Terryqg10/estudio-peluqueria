-- T-020: borrado de datos de la invitada sin el enlace de su cita (ADR-0032, RF-09, CA-40, CA-41).
-- La persona pide el borrado con su email y confirma un enlace de un solo uso que caduca en 1 h.
-- No se guarda el email en claro: solo su SHA-256, y la solicitud dura una hora.

create table public.deletion_requests (
  id bigint generated always as identity primary key,
  token_hash bytea not null unique,
  email_hash bytea not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index deletion_requests_email_idx on public.deletion_requests (email_hash);
create index deletion_requests_expires_idx on public.deletion_requests (expires_at);

-- Sin políticas: nadie con clave anónima o de usuario puede leer ni escribir. Solo las funciones
-- `security definer` y `service_role`.
alter table public.deletion_requests enable row level security;
revoke all on public.deletion_requests from public, anon, authenticated;
grant select, insert, delete on public.deletion_requests to service_role;

-- Cupo de solicitudes (mismo mecanismo que el del enlace de acceso, ADR-0021). Ni el email ni la IP
-- se guardan en claro: la aplicación pasa un HMAC con sal de servidor.
alter table public.rate_limits drop constraint rate_limits_kind_check;
alter table public.rate_limits
  add constraint rate_limits_kind_check
  check (kind in ('ip', 'login_ip', 'login_email', 'delete_ip', 'delete_email'));

create function public.consume_deletion_request_quota(
  p_email_hash text,
  p_ip_hash text default null,
  p_max_per_email integer default 3,
  p_max_per_ip integer default 10,
  p_window_minutes integer default 60
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := nullif(btrim(coalesce(p_email_hash, '')), '');
  v_ip text := nullif(btrim(coalesce(p_ip_hash, '')), '');
begin
  if v_email is null
     or char_length(v_email) not between 32 and 128
     or (v_ip is not null and char_length(v_ip) not between 32 and 128)
     or p_max_per_email < 1 or p_max_per_ip < 1 or p_window_minutes < 1 then
    raise exception 'INVALID_INPUT';
  end if;

  if v_ip is not null then
    perform pg_advisory_xact_lock(hashtextextended('delete-ip:' || v_ip, 0));
    if (
      select count(*) from public.rate_limits r
      where r.kind = 'delete_ip' and r.key_hash = v_ip
        and r.created_at > now() - make_interval(mins => p_window_minutes)
    ) >= p_max_per_ip then
      raise exception 'LIMIT_IP';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('delete-email:' || v_email, 0));
  if (
    select count(*) from public.rate_limits r
    where r.kind = 'delete_email' and r.key_hash = v_email
      and r.created_at > now() - make_interval(mins => p_window_minutes)
  ) >= p_max_per_email then
    raise exception 'LIMIT_EMAIL';
  end if;

  insert into public.rate_limits (kind, key_hash) values ('delete_email', v_email);
  if v_ip is not null then
    insert into public.rate_limits (kind, key_hash) values ('delete_ip', v_ip);
  end if;

  delete from public.rate_limits r
  where r.created_at < now() - make_interval(mins => p_window_minutes * 2);
end;
$$;

revoke all on function public.consume_deletion_request_quota(text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_deletion_request_quota(text, text, integer, integer, integer)
  to service_role;

-- Emite el token de borrado para un email. Solo service_role. Devuelve el token en claro UNA vez
-- (base64url, 43 caracteres, 256 bits) o `null` si ese email no tiene citas de invitada: la
-- aplicación responde igual en los dos casos y solo envía correo si hay token. Una solicitud nueva
-- sustituye a la anterior del mismo email.
create function public.request_guest_deletion(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash bytea;
  v_token text;
begin
  if char_length(v_email) not between 3 and 254 then
    raise exception 'INVALID_INPUT';
  end if;

  if not exists (
    select 1 from public.appointments a
    where a.user_id is null and a.anonymized_at is null and lower(a.guest_email) = v_email
  ) then
    return null;
  end if;

  v_hash := extensions.digest(v_email, 'sha256');
  delete from public.deletion_requests d where d.email_hash = v_hash;

  v_token := translate(
    rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='),
    '+/', '-_'
  );
  insert into public.deletion_requests (token_hash, email_hash, expires_at)
  values (extensions.digest(v_token, 'sha256'), v_hash, now() + interval '1 hour');

  return v_token;
end;
$$;

revoke all on function public.request_guest_deletion(text) from public, anon, authenticated;
grant execute on function public.request_guest_deletion(text) to service_role;

-- Confirma el borrado con el token del email. Cualquier fallo (forma, desconocido, caducado, ya
-- usado) da el mismo error. Un solo uso: el token se consume. Anonimiza todas las citas de invitada
-- de ese email (las futuras se cancelan). Devuelve cuántas citas cambió (0 si ya no quedaba ninguna).
create function public.confirm_guest_deletion(p_token text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash bytea;
  v_email text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'INVALID_TOKEN';
  end if;

  select d.email_hash into v_hash
  from public.deletion_requests d
  where d.token_hash = extensions.digest(p_token, 'sha256')
    and d.expires_at > now()
  for update;

  if v_hash is null then
    raise exception 'INVALID_TOKEN';
  end if;

  delete from public.deletion_requests d where d.email_hash = v_hash;

  select lower(a.guest_email) into v_email
  from public.appointments a
  where a.user_id is null and a.anonymized_at is null and a.guest_email is not null
    and extensions.digest(lower(a.guest_email), 'sha256') = v_hash
  limit 1;

  if v_email is null then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('booking-email:' || v_email, 0));
  return public.anonymize_person(null, v_email);
end;
$$;

revoke all on function public.confirm_guest_deletion(text) from public;
grant execute on function public.confirm_guest_deletion(text) to anon, authenticated;

-- La retención purga también las solicitudes caducadas (mismo cuerpo que en T-012 más esta línea).
create or replace function public.anonymize_expired_data(p_months integer default 24)
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

  delete from public.deletion_requests d where d.expires_at < now();

  return query select v_appointments, v_profiles, v_limits;
end;
$$;
