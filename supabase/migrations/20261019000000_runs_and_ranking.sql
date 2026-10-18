-- =============================================================================
-- dinoMau · Fase 5: apertura de partidas desde el servidor y posición en ranking
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Abre una partida: caduca la que hubiera abierta, comprueba que el dino es
-- del jugador y genera la semilla del recorrido EN EL SERVIDOR.
-- -----------------------------------------------------------------------------
create or replace function public.start_run(p_user uuid, p_dino text, p_client_version text default null)
returns table (run_id uuid, seed bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_dinos where user_id = p_user and dino_id = p_dino) then
    raise exception 'DINO_NOT_OWNED' using errcode = 'P0001';
  end if;

  update public.runs
     set status = 'expired', finished_at = now(), rejection_reason = 'superseded'
   where user_id = p_user and status = 'started';

  return query
  insert into public.runs (user_id, dino_id, seed, client_version)
  values (p_user, p_dino, floor(random() * 4294967295)::bigint, left(p_client_version, 40))
  returning runs.id, runs.seed;
end $$;

revoke execute on function public.start_run(uuid, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Posición del jugador autenticado en el ranking ('all' | 'weekly').
-- -----------------------------------------------------------------------------
create or replace function public.get_my_rank(p_period text default 'all')
returns table (rank bigint, score bigint)
language sql stable security definer set search_path = public as $$
  with scores as (
    select p.id as user_id, p.best_score as score
      from public.profiles p
     where p_period = 'all' and p.best_score > 0 and p.username is not null
    union all
    select r.user_id, max(r.score)
      from public.runs r join public.profiles p on p.id = r.user_id
     where p_period = 'weekly' and r.status = 'finished'
       and r.finished_at >= date_trunc('week', now() at time zone 'utc') at time zone 'utc'
       and p.username is not null
     group by r.user_id
  ), ranked as (
    select user_id, score, rank() over (order by score desc) as rank from scores
  )
  select rank, score from ranked where user_id = auth.uid();
$$;

grant execute on function public.get_my_rank(text) to authenticated;

-- Búsqueda case-insensitive de nombres (evita "Rex" y "rex" a la vez)
create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));
