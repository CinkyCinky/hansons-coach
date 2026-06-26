-- ============================================================================
--  Hansons Coach — Denník zmien plánu (`plan_change_log`)
-- ============================================================================
--  Čo to robí:
--    Vytvorí tabuľku, do ktorej sa zapíše KAŽDÁ zmena tréningu — odkiaľ prišla
--    (button / chat), aký typ zmeny to bol (prepočet / vynechanie / zrušenie /
--    presun / vytvorenie) a voliteľne dôvod. Vďaka tomu appka rozlíši napr.
--    „zrušené pre únavu" od „zrušené z lifestyle dôvodu" a kto zmenu inicioval.
--
--    RLS sa zapne rovnako ako pri `profiles`: priamy prístup cez verejný anon
--    kľúč je zablokovaný, backend píše/číta cez tajný service_role kľúč
--    (ten RLS automaticky obchádza). Appka funguje aj BEZ tejto tabuľky
--    (fail-open) — denník je bonus.
-- ============================================================================

-- 1) Tabuľka
create table if not exists public.plan_change_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  workout_date  date,                          -- dátum dotknutého tréningu (ak známy)
  workout_title text,                          -- názov tréningu
  sos_kind      text,                          -- speed|strength|tempo|long|easy|rest|other
  action        text not null,                 -- recompute|skip|cancel|move|create
  origin        text not null,                 -- button|chat
  reason        text,                          -- voľný dôvod (čo o to požiadal zverenec / prečo)
  created_at    timestamptz not null default now()
);

-- 2) Index na rýchle čítanie posledných zmien používateľa
create index if not exists plan_change_log_user_created_idx
  on public.plan_change_log (user_id, created_at desc);

-- 3) Row Level Security (rovnaký vzor ako profiles — backend = service_role obíde)
alter table public.plan_change_log enable row level security;
alter table public.plan_change_log force row level security;
revoke all on table public.plan_change_log from anon;
revoke all on table public.plan_change_log from authenticated;

-- ── Overenie (voliteľné) ────────────────────────────────────────────────────
-- select relname, relrowsecurity from pg_class where relname = 'plan_change_log';
