# 🔒 Návod: Zabezpečenie databázy (RLS) — krok po kroku

**Prečo:** Tvoja appka má v prehliadači verejný „anon" kľúč. Teraz s ním vie
ktokoľvek čítať a meniť tabuľku `profiles` priamo (vrátane šifrovaných hesiel a
Garmin tokenov). Týmto návodom to uzavrieš: backend bude jediný, kto má prístup.

**Princíp:** Backend prepneme na tajný **service_role** kľúč (má plný prístup) a
na databáze zapneme **RLS** (Row Level Security), čo zablokuje verejný anon kľúč.

> ⏱️ Trvá ~10 minút. Rob kroky **presne v tomto poradí**, inak sa appka dočasne
> „pokazí" (prestane načítavať dáta), kým ju nedokončíš.

---

## Krok 1 — Skopíruj si tajný service_role kľúč zo Supabase

1. Otvor **https://supabase.com** → prihlás sa → klikni na svoj projekt.
2. Vľavo dole klikni na ⚙️ **Project Settings**.
3. V menu klikni na **API Keys** (alebo **API**).
4. Nájdi sekciu **Project API keys**. Sú tam dva kľúče:
   - `anon` `public` — to je ten verejný (ten necháme tak).
   - **`service_role`** `secret` — **tento** potrebujeme. Klikni na **Reveal** /
     ikonku oka a potom **Copy**.
5. ⚠️ Tento kľúč je ako heslo k celej databáze. **Nikdy ho nedávaj do frontendu
   ani nikam verejne.** Patrí len na backend (Render).

---

## Krok 2 — Vlož service_role kľúč do backendu (Render)

1. Otvor **https://dashboard.render.com** → prihlás sa.
2. Klikni na službu **hansons-coach-api**.
3. V ľavom menu klikni na **Environment**.
4. Nájdi premennú **`SUPABASE_KEY`**. Klikni na ňu (ceruzka / Edit).
5. **Vymaž starú hodnotu** a **vlož skopírovaný `service_role` kľúč** z Kroku 1.
6. Klikni **Save Changes**. Render sa sám reštartuje (deploy) — počkaj ~1–2 min,
   kým bude stav **Live**.

---

## Krok 3 — Over, že appka stále funguje

1. Otvor svoju appku v prehliadači, **odhlás sa a znova prihlás**.
2. Skontroluj, že sa načíta **Prehľad** (dáta z Garminu) a **Plán**.
3. Ak všetko funguje → pokračuj. Ak nie → skontroluj, či si v Kroku 2 vložil
   správny `service_role` kľúč (nie omylom `anon`).

> Až teraz, keď backend používa service_role, môžeme bezpečne zamknúť databázu.

---

## Krok 4 — Zapni RLS (zamkni tabuľku)

1. Vráť sa do **Supabase** → tvoj projekt.
2. Vľavo klikni na **SQL Editor** (ikonka `</>`).
3. Klikni **+ New query**.
4. Otvor súbor **`backend/supabase/001_enable_rls_profiles.sql`**, skopíruj celý
   jeho obsah a **vlož** ho do okna.
5. Klikni zelené **Run** (alebo Ctrl+Enter).
6. Malo by sa vypísať **Success**.

---

## Krok 5 — Finálna kontrola

1. Znova otvor appku a over, že **Prehľad/Plán/Tréner** fungujú (backend dáta
   číta cez service_role, takže to ide ďalej).
2. Hotovo ✅ — tabuľka `profiles` je teraz prístupná **len cez backend**.

---

### Čo keď sa niečo pokazí?
- **Appka po Kroku 4 prestala načítavať dáta** → backend asi nemá service_role
  kľúč (Krok 2). Skontroluj `SUPABASE_KEY` v Render a daj redeploy.
- **Chceš RLS dočasne vypnúť** (núdza): v Supabase → SQL Editor spusti:
  `alter table public.profiles disable row level security;`

---

## Krok 6 — Zabezpeč zvyšné tabuľky (migrácia 005)

Kroky 1–5 zamkli iba `profiles`. Tabuľky `garmin_snapshots`, `metric_history`
a `athlete_memory` vznikli ručne a **nemali RLS vôbec** — cez verejný anon kľúč
sa dali čítať tvoje Garmin snapshoty, história metrík aj poznámky trénera o tebe.

### 6a — Zisti, ako na tom si

1. Supabase → **SQL Editor** → **+ New query**.
2. Vlož a spusti (**Run**):

```sql
select relname             as tabulka,
       relrowsecurity      as rls_zapnute,
       relforcerowsecurity as rls_vynutene
from pg_class
where relname in ('profiles','plan_change_log','garmin_snapshots',
                  'metric_history','athlete_memory')
order by relname;
```

3. Pozri stĺpec `rls_zapnute`. Kde je **false**, tam je tabuľka otvorená.
   (Ak sa niektorá tabuľka vo výsledku vôbec neobjaví, ešte neexistuje — to nevadí,
   ďalší krok ju vytvorí.)

### 6b — Spusti migráciu

1. Otvor **`backend/supabase/005_rls_remaining_tables.sql`**, skopíruj celý obsah.
2. Supabase → **SQL Editor** → **+ New query** → vlož → **Run**.
3. Očakávaný výsledok: **Success**.

Skript je idempotentný — dá sa spustiť opakovane bez škody. Tabuľky, ktoré už
existujú, sa nezmenia (dáta ostávajú), len sa im zapne RLS.

### 6c — Over

1. Znova spusti dotaz z **6a**. Všetkých 5 tabuliek musí mať
   `rls_zapnute = true` **aj** `rls_vynutene = true`.
2. Otvor appku a over, že **Prehľad**, **Reporty** a **Nastavenia → pamäť trénera**
   fungujú. Backend číta cez service_role, takže RLS ho neobmedzuje.

> ⚠️ Ak appka po tomto kroku prestane načítavať dáta, backend nemá `service_role`
> kľúč — vráť sa na Krok 1–2. Núdzové vypnutie:
> `alter table public.garmin_snapshots disable row level security;` (a analogicky
> pre ostatné).
