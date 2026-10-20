-- T-007: cupo de envíos del enlace mágico de acceso (ADR-0021, ADR-0020).
-- Reutiliza `rate_limits` con dos tipos nuevos. Ni el email ni la IP se guardan en claro: la
-- aplicación pasa un HMAC con sal de servidor y la fila caduca en horas (spec, sección 9).

alter table public.rate_limits drop constraint rate_limits_kind_check;
alter table public.rate_limits
  add constraint rate_limits_kind_check check (kind in ('ip', 'login_ip', 'login_email'));

-- Consume un envío de enlace. Atómica: los bloqueos serializan las peticiones de la misma persona
-- (siempre IP primero, email después) para que dos a la vez no superen el máximo. Cuenta envíos
-- pedidos, existan o no la cuenta (no se revela si el email tiene cuenta).
create function public.consume_login_link_quota(
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
    perform pg_advisory_xact_lock(hashtextextended('login-ip:' || v_ip, 0));
    if (
      select count(*) from public.rate_limits r
      where r.kind = 'login_ip' and r.key_hash = v_ip
        and r.created_at > now() - make_interval(mins => p_window_minutes)
    ) >= p_max_per_ip then
      raise exception 'LIMIT_IP';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('login-email:' || v_email, 0));
  if (
    select count(*) from public.rate_limits r
    where r.kind = 'login_email' and r.key_hash = v_email
      and r.created_at > now() - make_interval(mins => p_window_minutes)
  ) >= p_max_per_email then
    raise exception 'LIMIT_EMAIL';
  end if;

  insert into public.rate_limits (kind, key_hash) values ('login_email', v_email);
  if v_ip is not null then
    insert into public.rate_limits (kind, key_hash) values ('login_ip', v_ip);
  end if;

  -- Caducidad: los registros de más de dos ventanas se borran al escribir (hasta T-013).
  delete from public.rate_limits r
  where r.created_at < now() - make_interval(mins => p_window_minutes * 2);
end;
$$;

revoke all on function public.consume_login_link_quota(text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_login_link_quota(text, text, integer, integer, integer)
  to service_role;
