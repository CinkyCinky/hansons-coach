-- ============================================================================
--  Hansons Coach — Sync dnešného self-reportu „ako sa cítim" medzi zariadeniami
-- ============================================================================
--  Prečo: výber v časti „Ako sa dnes cítiš?" bol doteraz len v localStorage
--  jedného prehliadača (na mobile aj PC ho bolo treba klikať zvlášť). Teraz
--  ho ukladáme do profilu → synchronizuje sa naprieč zariadeniami.
--
--  Formát jsonb: { "date": "YYYY-MM-DD", "feeling": "ok|tired|pain",
--                  "pain": "dull|sharp", "pain_area": "..." }
--
--  Bezpečné: "add column if not exists" pridá len chýbajúci stĺpec.
--  Kde spustiť: Supabase → SQL Editor → New query → vlož → Run.
-- ============================================================================

alter table public.profiles add column if not exists daily_feeling jsonb;

-- Obnov PostgREST schema cache (inak by save hneď po migrácii mohol hlásiť
-- chýbajúci stĺpec 'daily_feeling'):
notify pgrst, 'reload schema';
