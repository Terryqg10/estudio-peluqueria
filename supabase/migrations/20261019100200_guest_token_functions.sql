-- T-002 / ADR-0009: acceso de invitada por token de 256 bits guardado como hash.
-- Funciones security definer con search_path fijado. El token en claro solo
-- existe un instante en el servidor y en el email; la BD guarda sha256(token).

-- Genera y guarda un token para una cita. Solo service_role.
-- Devuelve el token en claro UNA vez (base64url, 43 caracteres, 256 bits).
create function public.issue_management_token(p_appointment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_start timestamptz;
begin
  select lower(during) into v_start
  from public.appointments
  where id = p_appointment_id;

  if v_start is null then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  v_token := translate(
    rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='),
    '+/', '-_'
  );

  insert into public.appointment_tokens (appointment_id, token_hash, expires_at)
  values (
    p_appointment_id,
    extensions.digest(v_token, 'sha256'),
    v_start -- VERIFICAR: caduca al inicio de la cita
  )
  on conflict (appointment_id) do update
    set token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        created_at = now();

  return v_token;
end;
$$;

revoke all on function public.issue_management_token(uuid) from public, anon, authenticated;
grant execute on function public.issue_management_token(uuid) to service_role;

-- Consulta de la cita propia con el token. Cualquier fallo (forma, token
-- desconocido, caducado) devuelve el mismo error para no revelar nada.
create function public.get_guest_appointment(p_token text)
returns table (
  id uuid,
  stylist_id uuid,
  service_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.appointment_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'INVALID_TOKEN';
  end if;

  return query
  select a.id, a.stylist_id, a.service_id, lower(a.during), upper(a.during), a.status
  from public.appointment_tokens t
  join public.appointments a on a.id = t.appointment_id
  where t.token_hash = extensions.digest(p_token, 'sha256')
    and t.expires_at > now();

  if not found then
    raise exception 'INVALID_TOKEN';
  end if;
end;
$$;

-- Cancelación con el token. Solo si la cita sigue activa y faltan >= 24 h
-- (spec: RF-05). TOO_LATE solo se emite después de validar el token.
create function public.cancel_guest_appointment(p_token text)
returns table (id uuid, status public.appointment_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status public.appointment_status;
  v_start timestamptz;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'INVALID_TOKEN';
  end if;

  select a.id, a.status, lower(a.during)
    into v_id, v_status, v_start
  from public.appointment_tokens t
  join public.appointments a on a.id = t.appointment_id
  where t.token_hash = extensions.digest(p_token, 'sha256')
    and t.expires_at > now()
  for update of a;

  if v_id is null or v_status not in ('confirmed', 'pending') then
    raise exception 'INVALID_TOKEN';
  end if;

  if v_start - now() < interval '24 hours' then
    raise exception 'TOO_LATE';
  end if;

  update public.appointments a
  set status = 'cancelled', updated_at = now()
  where a.id = v_id;

  return query select v_id, 'cancelled'::public.appointment_status;
end;
$$;

revoke all on function public.get_guest_appointment(text) from public;
revoke all on function public.cancel_guest_appointment(text) from public;
grant execute on function public.get_guest_appointment(text) to anon, authenticated;
grant execute on function public.cancel_guest_appointment(text) to anon, authenticated;
