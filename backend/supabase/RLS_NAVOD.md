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
