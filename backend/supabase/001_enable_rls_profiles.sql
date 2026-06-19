-- ============================================================================
--  Hansons Coach — Zabezpečenie tabuľky `profiles` (Row Level Security)
-- ============================================================================
--  Čo to robí:
--    Zapne RLS na tabuľke `profiles`, čím ZABLOKUJE priamy prístup cez verejný
--    "anon" kľúč (ten je viditeľný v prehliadači). Backend používa tajný
--    "service_role" kľúč, ktorý RLS automaticky obchádza — takže aplikácia
--    funguje ďalej, ale tabuľku už nikto nedokáže čítať/meniť priamo z webu.
--
--  DÔLEŽITÉ: Najprv prepni backend (Render) na service_role kľúč a over, že
--  appka funguje. Až potom spusti tento skript. (Postup v RLS_NAVOD.md.)
-- ============================================================================

-- 1) Zapni Row Level Security
alter table public.profiles enable row level security;

-- 2) Vynúť RLS aj pre vlastníka tabuľky (service_role ho aj tak obchádza)
alter table public.profiles force row level security;

-- 3) Istota: odober priame práva verejným rolám (anon = prehliadač,
--    authenticated = prihlásený používateľ cez anon kľúč).
--    Backend (service_role) tým nie je dotknutý.
revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;

-- Žiadne ďalšie "policy" zámerne nepridávame — bez policy RLS zamietne
-- akýkoľvek priamy prístup okrem service_role kľúča (ten ho obchádza).

-- ── Overenie (voliteľné) ────────────────────────────────────────────────────
-- Po spustení by tento dotaz mal vrátiť rowsecurity = true:
--   select relname, relrowsecurity, relforcerowsecurity
--   from pg_class where relname = 'profiles';
