-- ============================================================================
--  Hansons Coach — Zabezpečenie zvyšných tabuliek (RLS)
-- ============================================================================
--  Prečo tento skript existuje:
--    Migrácia 001 zabezpečila `profiles`, migrácia 003 `plan_change_log`.
--    Tabuľky `garmin_snapshots`, `metric_history` a `athlete_memory` však
--    v repozitári nemali ŽIADNU migráciu — vznikli ručne. Pri ručnom
--    `create table` je RLS vypnutá a Supabase dáva rolám anon/authenticated
--    plný prístup. Verejný anon kľúč je pritom v každom prehliadači, takže
--    ktokoľvek by vedel čítať tvoje Garmin snapshoty, históriu metrík aj
--    poznámky AI trénera o tebe.
--
--  Čo skript robí:
--    1) Vytvorí tabuľky, ak ešte neexistujú (presne v tvare, aký zapisuje
--       backend/modules/database.py) — ak existujú, nechá ich tak.
--    2) Doplní chýbajúce stĺpce (bezpečné `add column if not exists`).
--    3) Zapne RLS a odoberie práva verejným rolám — rovnaký vzor ako 001/003.
--
--  Backend používa tajný service_role kľúč, ktorý RLS obchádza, takže appka
--  funguje ďalej. Ak backend service_role kľúč ešte NEMÁ, najprv dokonči
--  RLS_NAVOD.md (Krok 1–2), inak appka prestane načítavať dáta.
--
--  Skript je idempotentný — pokojne ho spusti aj viackrát.
--  Kde spustiť: Supabase → SQL Editor → New query → vlož → Run.
-- ============================================================================

-- ── 1) garmin_snapshots — denná cache stiahnutých Garmin dát ────────────────
create table if not exists public.garmin_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  data        jsonb,
  fetched_at  timestamptz not null default now(),
  unique (user_id, date)          -- backend robí upsert on_conflict="user_id,date"
);

create index if not exists garmin_snapshots_user_date_idx
  on public.garmin_snapshots (user_id, date desc);

-- ── 2) metric_history — denné ukazovatele formy ─────────────────────────────
create table if not exists public.metric_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  vo2max      numeric,
  resting_hr  numeric,
  ac_ratio    numeric,
  hrv         numeric,
  unique (user_id, date)          -- backend robí upsert on_conflict="user_id,date"
);

-- `hrv` pribudlo neskôr — v database.py je preto fallback zápis bez neho.
-- Týmto sa stĺpec doplní a fallback prestane byť potrebný.
alter table public.metric_history add column if not exists hrv numeric;

create index if not exists metric_history_user_date_idx
  on public.metric_history (user_id, date);

-- ── 3) athlete_memory — dlhodobá pamäť AI trénera o zverencovi ──────────────
create table if not exists public.athlete_memory (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null default 'note',
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists athlete_memory_user_created_idx
  on public.athlete_memory (user_id, created_at);

-- ── 4) Row Level Security na všetkých troch ─────────────────────────────────
--  Bez `policy` RLS zamietne akýkoľvek priamy prístup; service_role (backend)
--  ho obchádza. Rovnaký vzor ako v 001_enable_rls_profiles.sql.

alter table public.garmin_snapshots enable row level security;
alter table public.garmin_snapshots force row level security;
revoke all on table public.garmin_snapshots from anon;
revoke all on table public.garmin_snapshots from authenticated;

alter table public.metric_history enable row level security;
alter table public.metric_history force row level security;
revoke all on table public.metric_history from anon;
revoke all on table public.metric_history from authenticated;

alter table public.athlete_memory enable row level security;
alter table public.athlete_memory force row level security;
revoke all on table public.athlete_memory from anon;
revoke all on table public.athlete_memory from authenticated;

-- PostgREST si drží schema cache — po zmenách ju obnov.
notify pgrst, 'reload schema';

-- ── Overenie ────────────────────────────────────────────────────────────────
--  Spusti PO tomto skripte. Všetkých 5 riadkov musí mať rowsecurity = true:
--
--    select relname            as tabulka,
--           relrowsecurity     as rls_zapnute,
--           relforcerowsecurity as rls_vynutene
--    from pg_class
--    where relname in ('profiles','plan_change_log','garmin_snapshots',
--                      'metric_history','athlete_memory')
--    order by relname;
