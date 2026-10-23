-- T-027 (ADR-0036, RF-13, CA-51): cupo de entradas a la cuenta demo por IP. Reutiliza `rate_limits` con un tipo nuevo:
-- la IP no se guarda en claro (la aplicación pasa un HMAC con la sal de servidor) y la fila caduca en horas.

alter table public.rate_limits drop constraint rate_limits_kind_check;
alter table public.rate_limits
  add constraint rate_limits_kind_check
  check (kind in ('ip', 'login_ip', 'login_email', 'delete_ip', 'delete_email', 'demo_ip'));

-- Consume una entrada de la demo. Atómica: el bloqueo serializa las peticiones de la misma IP para que dos a la vez
-- no superen el máximo. Falla con LIMIT_IP al agotar el cupo.
create function public.consume_demo_entry_quota(
  p_ip_hash text,
  p_max_per_ip integer default 10,
  p_window_minutes integer default 60
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip_hash, '')), '');
begin
  if v_ip is null
     or char_length(v_ip) not between 32 and 128
     or p_max_per_ip < 1 or p_window_minutes < 1 then
    raise exception 'INVALID_INPUT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('demo-ip:' || v_ip, 0));
  if (
    select count(*) from public.rate_limits r
    where r.kind = 'demo_ip' and r.key_hash = v_ip
      and r.created_at > now() - make_interval(mins => p_window_minutes)
  ) >= p_max_per_ip then
    raise exception 'LIMIT_IP';
  end if;

  insert into public.rate_limits (kind, key_hash) values ('demo_ip', v_ip);

  -- Caducidad: los registros de más de dos ventanas se borran al escribir.
  delete from public.rate_limits r
  where r.kind = 'demo_ip' and r.created_at < now() - make_interval(mins => p_window_minutes * 2);
end;
$$;

revoke all on function public.consume_demo_entry_quota(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_demo_entry_quota(text, integer, integer) to service_role;
