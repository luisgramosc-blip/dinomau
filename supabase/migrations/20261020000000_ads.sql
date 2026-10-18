-- =============================================================================
-- dinoMau · Fase 9: recompensas por ver anuncios
-- -----------------------------------------------------------------------------
-- Un juego web no puede demostrar al servidor que el jugador vio un anuncio
-- (AdSense para juegos no tiene verificación servidor a servidor). Por eso las
-- monedas por anuncio llevan TOPES DIARIOS aplicados aquí: aunque alguien
-- llame a la función sin ver el anuncio, como mucho gana lo de un día normal.
-- =============================================================================

alter type public.coin_reason add value if not exists 'ad_double';  -- duplicar monedas de una partida
alter type public.coin_reason add value if not exists 'ad_gift';    -- regalo diario

insert into public.game_config (key, value) values
  ('ads', '{
     "doubleCoinsDailyLimit": 5,
     "doubleCoinsMaxBonus": 2000,
     "doubleCoinsWindowMinutes": 15,
     "dailyGiftCoins": 150,
     "dailyGiftDailyLimit": 3
   }')
on conflict (key) do nothing;

create table public.ad_rewards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('double', 'gift')),
  run_id     uuid references public.runs (id) on delete set null,
  coins      integer not null check (coins > 0),
  created_at timestamptz not null default now(),
  check ((kind = 'double') = (run_id is not null))
);

create index ad_rewards_user_day_idx on public.ad_rewards (user_id, created_at desc);
-- Cada partida se puede duplicar una sola vez
create unique index ad_rewards_one_double_per_run_idx on public.ad_rewards (run_id) where kind = 'double';

-- -----------------------------------------------------------------------------
-- Canje de una recompensa. Devuelve {coins, bonus, remaining}.
--   p_kind 'gift'   → monedas fijas, con tope de usos por día UTC
--   p_kind 'double' → las monedas acreditadas en la partida p_run (con tope),
--                     solo si es del jugador, terminó bien y hace poco
-- -----------------------------------------------------------------------------
create or replace function public.claim_ad_reward(p_user uuid, p_kind text, p_run uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cfg     jsonb := (select value from public.game_config where key = 'ads');
  v_limit int;
  v_used  int;
  v_bonus int;
  v_run   public.runs;
  v_id    uuid;
  v_coins bigint;
  v_day   timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
begin
  if p_kind not in ('double', 'gift') then
    raise exception 'INVALID_KIND' using errcode = 'P0001';
  end if;

  -- Bloquea el perfil: dos peticiones a la vez no pueden saltarse el tope
  perform 1 from public.profiles where id = p_user for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_limit := case p_kind when 'double' then (cfg ->> 'doubleCoinsDailyLimit')::int
                         else (cfg ->> 'dailyGiftDailyLimit')::int end;
  select count(*) into v_used from public.ad_rewards
   where user_id = p_user and kind = p_kind and created_at >= v_day;
  if v_used >= v_limit then
    raise exception 'AD_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  if p_kind = 'gift' then
    v_bonus := (cfg ->> 'dailyGiftCoins')::int;
  else
    select * into v_run from public.runs where id = p_run;
    if v_run.id is null or v_run.user_id <> p_user or v_run.status <> 'finished'
       or coalesce(v_run.coins_awarded, 0) <= 0
       or v_run.finished_at < now() - make_interval(mins => (cfg ->> 'doubleCoinsWindowMinutes')::int) then
      raise exception 'RUN_NOT_ELIGIBLE' using errcode = 'P0001';
    end if;
    v_bonus := least(v_run.coins_awarded, (cfg ->> 'doubleCoinsMaxBonus')::int);
  end if;

  begin
    insert into public.ad_rewards (user_id, kind, run_id, coins)
    values (p_user, p_kind, case when p_kind = 'double' then p_run end, v_bonus)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'ALREADY_CLAIMED' using errcode = 'P0001';
  end;

  v_coins := public.apply_coin_delta(p_user, v_bonus,
                                     (case p_kind when 'double' then 'ad_double' else 'ad_gift' end)::public.coin_reason,
                                     v_id::text);

  return jsonb_build_object('coins', v_coins, 'bonus', v_bonus, 'remaining', v_limit - v_used - 1);
end $$;

-- Seguridad: el jugador solo ve sus canjes; solo service_role canjea
alter table public.ad_rewards enable row level security;
create policy "own ad rewards read" on public.ad_rewards for select to authenticated using (user_id = auth.uid());
revoke all on public.ad_rewards from anon, authenticated;
grant select on public.ad_rewards to authenticated;
revoke execute on function public.claim_ad_reward(uuid, text, uuid) from public, anon, authenticated;
