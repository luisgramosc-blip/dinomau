-- =============================================================================
-- dinoMau · Esquema inicial
-- -----------------------------------------------------------------------------
-- Principios:
--   1. El cliente SOLO lee sus propios datos (RLS). Nunca escribe monedas,
--      compras, partidas, batallas ni referidos directamente.
--   2. Toda mutación económica pasa por una Edge Function (service_role) que
--      llama a funciones SQL transaccionales de este archivo.
--   3. Cada movimiento de monedas queda en `coin_ledger` (libro contable
--      inmutable). `profiles.coins` es un saldo cacheado que se actualiza en la
--      misma transacción.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.coin_reason as enum (
  'run_reward',        -- monedas ganadas en una partida (incluye efecto de batallas)
  'purchase',          -- compra de un dinosaurio (delta negativo)
  'referral_welcome',  -- bono para quien se registra con un link de referido
  'referral_inviter',  -- bono para quien invitó (primera partida del referido)
  'adjustment'         -- ajustes manuales de soporte
);

create type public.run_status as enum ('started', 'finished', 'rejected', 'expired');
create type public.battle_result as enum ('win', 'loss');

-- -----------------------------------------------------------------------------
-- Configuración de juego (fuente de verdad del SERVIDOR)
-- Los archivos src/config/*.config.ts son espejo para el cliente; las Edge
-- Functions leen siempre de aquí.
-- -----------------------------------------------------------------------------
create table public.game_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.game_config (key, value) values
  ('battle', '{
     "coinThreshold": 500,
     "winMultiplier": 2,
     "lossPenalty": 100,
     "multiplyTarget": "run",
     "maxGainPerBattle": 5000
   }'),
  ('referral', '{
     "welcomeBonus": 500,
     "inviterBonusEnabled": true,
     "inviterBonus": 250,
     "requireEmailVerified": true,
     "claimWindowHours": 72,
     "maxInviterBonusesPerDay": 20
   }'),
  ('anticheat', '{
     "maxCoinsPerSecond": 20,
     "maxCoinsPerMeter": 1.0,
     "speedStart": 13,
     "speedMax": 32,
     "speedRampTime": 150,
     "sprintBonusMeters": 150,
     "distanceTolerance": 0.03,
     "maxScorePerMeter": 1.25,
     "clockToleranceMs": 5000,
     "minRunDurationMs": 3000,
     "maxRunDurationMs": 7200000,
     "runExpiryMinutes": 180,
     "maxBattlesPerRun": 60
   }');

-- -----------------------------------------------------------------------------
-- Catálogo de dinosaurios (precios autoritativos para compras)
-- -----------------------------------------------------------------------------
create table public.dinos (
  id           text primary key,
  name         text not null,
  price        integer not null check (price >= 0),
  speed        smallint not null check (speed between 1 and 10),
  agility      smallint not null check (agility between 1 and 10),
  battle_power smallint not null check (battle_power between 1 and 100),
  ability      text not null,
  sort_order   smallint not null unique,
  is_active    boolean not null default true
);

insert into public.dinos (id, name, price, speed, agility, battle_power, ability, sort_order) values
  ('compsognathus',   'Compsognathus',          0, 3, 6,   8, 'none',             1),
  ('gallimimus',      'Gallimimus',          2000, 7, 6,  14, 'fast_runner',      2),
  ('parasaurolophus', 'Parasaurolophus',     5000, 5, 5,  22, 'stun_roar',        3),
  ('velociraptor',    'Velociraptor',       10000, 7, 9,  35, 'double_jump',      4),
  ('stegosaurus',     'Stegosaurus',        20000, 4, 4,  48, 'plate_shield',     5),
  ('triceratops',     'Triceratops',        35000, 5, 4,  60, 'rock_breaker',     6),
  ('ankylosaurus',    'Ankylosaurus',       50000, 4, 3,  72, 'tail_club',        7),
  ('spinosaurus',     'Spinosaurus',        75000, 6, 6,  85, 'swimmer',          8),
  ('tyrannosaurus',   'Tyrannosaurus Rex', 120000, 6, 5, 100, 'apex_power',       9);

-- -----------------------------------------------------------------------------
-- Perfiles (1:1 con auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  username         text unique
                   check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  avatar_url       text,
  referral_code    text not null unique,
  coins            bigint not null default 0 check (coins >= 0),
  equipped_dino_id text not null default 'compsognathus' references public.dinos (id),
  best_score       bigint not null default 0,
  total_runs       integer not null default 0,
  battles_won      integer not null default 0,
  battles_lost     integer not null default 0,
  language         text not null default 'es' check (language in ('es', 'en')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index profiles_best_score_idx on public.profiles (best_score desc) where best_score > 0;

-- Dinos que posee cada usuario
create table public.user_dinos (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  dino_id     text not null references public.dinos (id),
  acquired_at timestamptz not null default now(),
  primary key (user_id, dino_id)
);

-- -----------------------------------------------------------------------------
-- Libro contable de monedas (append-only)
-- -----------------------------------------------------------------------------
create table public.coin_ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  delta         bigint not null check (delta <> 0),
  reason        public.coin_reason not null,
  ref_id        text,             -- run_id, dino_id, referral_id...
  balance_after bigint not null check (balance_after >= 0),
  created_at    timestamptz not null default now()
);

create index coin_ledger_user_idx on public.coin_ledger (user_id, created_at desc);
-- Idempotencia: el mismo evento no puede acreditarse dos veces
create unique index coin_ledger_idempotency_idx
  on public.coin_ledger (user_id, reason, ref_id) where ref_id is not null;

-- -----------------------------------------------------------------------------
-- Partidas
-- Flujo: start-run crea la fila (status=started, seed) → el cliente juega con
-- esa semilla → finish-run valida y llama a finalize_run().
-- -----------------------------------------------------------------------------
create table public.runs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  dino_id            text not null references public.dinos (id),
  seed               bigint not null,
  status             public.run_status not null default 'started',
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  client_duration_ms integer check (client_duration_ms >= 0),
  distance           integer check (distance >= 0),
  score              bigint check (score >= 0),
  coins_collected    integer check (coins_collected >= 0),   -- recogidas en pista
  coins_awarded      integer check (coins_awarded >= 0),     -- acreditadas tras batallas/validación
  rejection_reason   text,
  client_version     text
);

create index runs_user_idx on public.runs (user_id, started_at desc);
create index runs_weekly_idx on public.runs (finished_at, score desc) where status = 'finished';
-- Solo una partida abierta por usuario
create unique index runs_one_open_idx on public.runs (user_id) where status = 'started';

-- -----------------------------------------------------------------------------
-- Batallas (pertenecen a una partida)
-- -----------------------------------------------------------------------------
create table public.battles (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references public.runs (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  sequence         smallint not null check (sequence >= 1),   -- nº de batalla en la partida
  rival_id         text not null,
  rival_power      smallint not null,
  player_power     smallint not null,
  qte_accuracy     real not null check (qte_accuracy between 0 and 1),
  result           public.battle_result not null,
  run_coins_before integer not null check (run_coins_before >= 0),
  coins_delta      integer not null,                          -- calculado por el servidor
  at_ms            integer not null check (at_ms >= 0),       -- ms desde el inicio de la partida
  created_at       timestamptz not null default now(),
  unique (run_id, sequence)
);

create index battles_user_idx on public.battles (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Referidos
-- -----------------------------------------------------------------------------
create table public.referrals (
  id                       uuid primary key default gen_random_uuid(),
  inviter_id               uuid not null references public.profiles (id) on delete cascade,
  invitee_id               uuid not null unique references public.profiles (id) on delete cascade,
  code_used                text not null,
  welcome_bonus            integer not null,
  inviter_bonus            integer,
  inviter_bonus_granted_at timestamptz,
  created_at               timestamptz not null default now(),
  check (inviter_id <> invitee_id)
);

create index referrals_inviter_idx on public.referrals (inviter_id);

-- =============================================================================
-- Funciones auxiliares
-- =============================================================================

-- Código de referido de 7 caracteres sin caracteres ambiguos (0/O, 1/I/L)
create or replace function public.generate_referral_code()
returns text language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..7 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = code);
  end loop;
  return code;
end $$;

-- Al crear un usuario en auth: perfil + dino inicial
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, referral_code)
  values (new.id, public.generate_referral_code());

  insert into public.user_dinos (user_id, dino_id)
  values (new.id, 'compsognathus');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at automático + validación de que el dino equipado es propio
create or replace function public.profiles_before_update()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.equipped_dino_id is distinct from old.equipped_dino_id
     and not exists (select 1 from public.user_dinos
                     where user_id = new.id and dino_id = new.equipped_dino_id) then
    raise exception 'DINO_NOT_OWNED' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger profiles_before_update
  before update on public.profiles
  for each row execute function public.profiles_before_update();

-- -----------------------------------------------------------------------------
-- Movimiento de monedas atómico (bloquea la fila del perfil)
-- -----------------------------------------------------------------------------
create or replace function public.apply_coin_delta(
  p_user uuid, p_delta bigint, p_reason public.coin_reason, p_ref text
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  new_balance bigint;
begin
  update public.profiles
     set coins = coins + p_delta
   where id = p_user and coins + p_delta >= 0
  returning coins into new_balance;

  if new_balance is null then
    if exists (select 1 from public.profiles where id = p_user) then
      raise exception 'INSUFFICIENT_COINS' using errcode = 'P0001';
    end if;
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.coin_ledger (user_id, delta, reason, ref_id, balance_after)
  values (p_user, p_delta, p_reason, p_ref, new_balance);

  return new_balance;
end $$;

-- -----------------------------------------------------------------------------
-- Compra de dinosaurio
-- -----------------------------------------------------------------------------
create or replace function public.purchase_dino(p_user uuid, p_dino text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_price integer;
begin
  select price into v_price from public.dinos where id = p_dino and is_active;
  if v_price is null then
    raise exception 'DINO_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.user_dinos where user_id = p_user and dino_id = p_dino) then
    raise exception 'ALREADY_OWNED' using errcode = 'P0001';
  end if;

  insert into public.user_dinos (user_id, dino_id) values (p_user, p_dino);

  if v_price > 0 then
    return public.apply_coin_delta(p_user, -v_price, 'purchase', p_dino);
  end if;
  return (select coins from public.profiles where id = p_user);
end $$;

-- -----------------------------------------------------------------------------
-- Canje de código de referido (la Edge Function verifica email confirmado)
-- -----------------------------------------------------------------------------
create or replace function public.claim_referral(p_invitee uuid, p_code text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  cfg       jsonb := (select value from public.game_config where key = 'referral');
  v_inviter uuid;
  v_created timestamptz;
  v_ref_id  uuid;
  v_bonus   integer := (cfg ->> 'welcomeBonus')::int;
begin
  select id into v_inviter from public.profiles where referral_code = upper(p_code);
  if v_inviter is null then
    raise exception 'INVALID_CODE' using errcode = 'P0001';
  end if;
  if v_inviter = p_invitee then
    raise exception 'SELF_REFERRAL' using errcode = 'P0001';
  end if;
  -- Sin referidos cruzados (A invita a B y B invita a A)
  if exists (select 1 from public.referrals where inviter_id = p_invitee and invitee_id = v_inviter) then
    raise exception 'SELF_REFERRAL' using errcode = 'P0001';
  end if;

  select created_at into v_created from public.profiles where id = p_invitee;
  if v_created < now() - make_interval(hours => (cfg ->> 'claimWindowHours')::int) then
    raise exception 'CLAIM_WINDOW_EXPIRED' using errcode = 'P0001';
  end if;

  -- invitee_id es UNIQUE → un solo bono por cuenta, aunque haya carreras
  insert into public.referrals (inviter_id, invitee_id, code_used, welcome_bonus)
  values (v_inviter, p_invitee, upper(p_code), v_bonus)
  returning id into v_ref_id;

  return public.apply_coin_delta(p_invitee, v_bonus, 'referral_welcome', v_ref_id::text);
exception
  when unique_violation then
    raise exception 'ALREADY_REFERRED' using errcode = 'P0001';
end $$;

-- -----------------------------------------------------------------------------
-- Cierre de partida. La Edge Function `finish-run` ya validó plausibilidad y
-- calculó las monedas a acreditar (incluyendo batallas y topes). Aquí solo se
-- persiste todo de forma atómica.
--   p_battles: [{sequence, rival_id, rival_power, player_power, qte_accuracy,
--               result, run_coins_before, coins_delta, at_ms}, ...]
-- -----------------------------------------------------------------------------
create or replace function public.finalize_run(
  p_run_id uuid,
  p_status public.run_status,
  p_duration_ms integer,
  p_distance integer,
  p_score bigint,
  p_coins_collected integer,
  p_coins_awarded integer,
  p_battles jsonb,
  p_rejection_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_run      public.runs;
  v_won      int := 0;
  v_lost     int := 0;
  v_ref      public.referrals;
  v_cfg      jsonb := (select value from public.game_config where key = 'referral');
  v_balance  bigint;
  v_old_best bigint;
begin
  select * into v_run from public.runs where id = p_run_id for update;
  if v_run.id is null or v_run.status <> 'started' then
    raise exception 'RUN_NOT_OPEN' using errcode = 'P0001';
  end if;

  update public.runs set
    status = p_status, finished_at = now(), client_duration_ms = p_duration_ms,
    distance = p_distance, score = p_score, coins_collected = p_coins_collected,
    coins_awarded = case when p_status = 'finished' then p_coins_awarded else 0 end,
    rejection_reason = p_rejection_reason
  where id = p_run_id;

  if p_status <> 'finished' then
    return jsonb_build_object('status', p_status);
  end if;

  insert into public.battles (run_id, user_id, sequence, rival_id, rival_power, player_power,
                              qte_accuracy, result, run_coins_before, coins_delta, at_ms)
  select p_run_id, v_run.user_id, b.sequence, b.rival_id, b.rival_power, b.player_power,
         b.qte_accuracy, b.result, b.run_coins_before, b.coins_delta, b.at_ms
  from jsonb_to_recordset(coalesce(p_battles, '[]')) as b(
    sequence smallint, rival_id text, rival_power smallint, player_power smallint,
    qte_accuracy real, result public.battle_result, run_coins_before int,
    coins_delta int, at_ms int);

  select count(*) filter (where result = 'win'), count(*) filter (where result = 'loss')
    into v_won, v_lost from public.battles where run_id = p_run_id;

  select best_score into v_old_best from public.profiles where id = v_run.user_id for update;

  update public.profiles set
    total_runs   = total_runs + 1,
    battles_won  = battles_won + v_won,
    battles_lost = battles_lost + v_lost,
    best_score   = greatest(best_score, p_score)
  where id = v_run.user_id
  returning coins into v_balance;

  if p_coins_awarded > 0 then
    v_balance := public.apply_coin_delta(v_run.user_id, p_coins_awarded, 'run_reward', p_run_id::text);
  end if;

  -- Bono al invitador en la primera partida finalizada del referido
  -- (con tope diario por invitador para frenar granjas de cuentas)
  if (v_cfg ->> 'inviterBonusEnabled')::boolean then
    select * into v_ref from public.referrals
     where invitee_id = v_run.user_id and inviter_bonus_granted_at is null
     for update;
    if v_ref.id is not null and (
      select count(*) from public.referrals
       where inviter_id = v_ref.inviter_id and inviter_bonus_granted_at > now() - interval '24 hours'
    ) < coalesce((v_cfg ->> 'maxInviterBonusesPerDay')::int, 1000000) then
      update public.referrals
         set inviter_bonus = (v_cfg ->> 'inviterBonus')::int, inviter_bonus_granted_at = now()
       where id = v_ref.id;
      perform public.apply_coin_delta(v_ref.inviter_id, (v_cfg ->> 'inviterBonus')::int,
                                      'referral_inviter', v_ref.id::text);
    end if;
  end if;

  return jsonb_build_object('status', 'finished', 'coins', v_balance,
                            'awarded', p_coins_awarded, 'newRecord', p_score > v_old_best);
end $$;

-- -----------------------------------------------------------------------------
-- Ranking (security definer: expone solo columnas públicas)
-- -----------------------------------------------------------------------------
create or replace function public.get_leaderboard(p_period text default 'all', p_limit int default 50)
returns table (rank bigint, user_id uuid, username text, dino_id text, score bigint)
language sql stable security definer set search_path = public as $$
  with scores as (
    select p.id as user_id, p.username, p.equipped_dino_id as dino_id, p.best_score as score
      from public.profiles p
     where p_period = 'all' and p.best_score > 0 and p.username is not null
    union all
    select r.user_id, p.username, p.equipped_dino_id, max(r.score)
      from public.runs r join public.profiles p on p.id = r.user_id
     where p_period = 'weekly' and r.status = 'finished'
       and r.finished_at >= date_trunc('week', now() at time zone 'utc') at time zone 'utc'
       and p.username is not null
     group by r.user_id, p.username, p.equipped_dino_id
  )
  select rank() over (order by score desc), user_id, username, dino_id, score
    from scores order by score desc limit least(p_limit, 100);
$$;

-- =============================================================================
-- Seguridad: RLS + privilegios
-- =============================================================================
alter table public.game_config enable row level security;
alter table public.dinos       enable row level security;
alter table public.profiles    enable row level security;
alter table public.user_dinos  enable row level security;
alter table public.coin_ledger enable row level security;
alter table public.runs        enable row level security;
alter table public.battles     enable row level security;
alter table public.referrals   enable row level security;

-- Lectura pública del catálogo y la configuración
create policy "config readable" on public.game_config for select to anon, authenticated using (true);
create policy "dinos readable"  on public.dinos       for select to anon, authenticated using (true);

-- Cada usuario solo ve lo suyo
create policy "own profile read"   on public.profiles    for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles    for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "own dinos read"     on public.user_dinos  for select to authenticated using (user_id = auth.uid());
create policy "own ledger read"    on public.coin_ledger for select to authenticated using (user_id = auth.uid());
create policy "own runs read"      on public.runs        for select to authenticated using (user_id = auth.uid());
create policy "own battles read"   on public.battles     for select to authenticated using (user_id = auth.uid());
create policy "own referrals read" on public.referrals   for select to authenticated
  using (inviter_id = auth.uid() or invitee_id = auth.uid());

-- Supabase concede por defecto TODO a anon/authenticated sobre objetos nuevos.
-- Se revoca y se concede solo lo imprescindible (RLS filtra además las filas).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.game_config, public.dinos to anon, authenticated;
grant select on public.profiles, public.user_dinos, public.coin_ledger,
                public.runs, public.battles, public.referrals to authenticated;

-- El cliente solo puede modificar estas columnas de su perfil
grant update (username, avatar_url, language, equipped_dino_id) on public.profiles to authenticated;

-- No hay políticas de INSERT/DELETE para clientes: solo service_role escribe.
-- Las funciones económicas no son invocables desde el cliente.
revoke execute on function public.apply_coin_delta(uuid, bigint, public.coin_reason, text) from public, anon, authenticated;
revoke execute on function public.purchase_dino(uuid, text)                                from public, anon, authenticated;
revoke execute on function public.claim_referral(uuid, text)                               from public, anon, authenticated;
revoke execute on function public.finalize_run(uuid, public.run_status, integer, integer, bigint, integer, integer, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.generate_referral_code() from public, anon, authenticated;

grant execute on function public.get_leaderboard(text, int) to anon, authenticated;
