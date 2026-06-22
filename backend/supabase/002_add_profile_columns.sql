-- ============================================================================
--  Hansons Coach — Doplnenie chýbajúcich stĺpcov v tabuľke `profiles`
-- ============================================================================
--  Prečo: backend zapisuje do profilu polia (display_name, race_date,
--  ai_context, garmin_tokens, …), ktoré v tabuľke chýbali → chyba PGRST204
--  "Could not find the 'display_name' column".
--
--  Tento skript je BEZPEČNÝ: "add column if not exists" pridá len to, čo
--  chýba, a existujúce stĺpce (ani dáta) sa nedotkne.
--
--  Kde spustiť: Supabase → SQL Editor → New query → vlož → Run.
-- ============================================================================

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists garmin_email text;
alter table public.profiles add column if not exists garmin_password_encrypted text;
alter table public.profiles add column if not exists target_time text;
alter table public.profiles add column if not exists training_start_date text;
alter table public.profiles add column if not exists race_date text;
alter table public.profiles add column if not exists ai_context text;
-- Variant Hanson plánu: 'advanced' (default) | 'beginner' | 'just_finish'
alter table public.profiles add column if not exists plan_variant text default 'advanced';
-- Garmin session tokeny (bez tohto stĺpca by tiché ukladanie tokenov zlyhalo
-- a appka by sa stále prihlasovala nanovo):
alter table public.profiles add column if not exists garmin_tokens jsonb;

-- Po pridaní stĺpcov PostgREST niekedy drží starú "schema cache".
-- Toto ju obnoví (ak by save hneď po migrácii ešte hlásil chýbajúci stĺpec):
notify pgrst, 'reload schema';

-- ── Overenie (voliteľné) ────────────────────────────────────────────────────
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--   order by column_name;
