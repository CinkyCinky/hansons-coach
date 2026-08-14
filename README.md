🏃 Hansons Coach
> Full-stack AI bežecký tréner, ktorý generuje personalizované plány podľa **Hansonovej metódy** a zapisuje tréningy **priamo do Garmin hodiniek**.
Built with AI-assisted development (vibe coding) — navrhnuté a postavené pomocou moderných AI nástrojov.
---
✨ Čo to dokáže
📅 Generuje týždenný tréningový plán podľa Hansonovej metódy (varianty Beginner / Advanced / Just Finish).
⌚ Zapisuje tréningy priamo do Garmin — vrátane intervalových repeat-blokov (1/6, 2/6…).
🧠 Adaptuje záťaž podľa reálnych dát z Garminu (HRV, Body Battery, acute:chronic load).
💬 AI chat tréner — vysvetlí „prečo" za každým tréningom, po slovensky.
📊 Prehľad, reporty a editácia plánu pred zápisom do hodiniek.
🏗️ Architektúra — prečo je zaujímavá
Kľúčové rozhodnutie: oddeliť čísla od jazyka.
```
   Deterministické jadro (Python)        LLM (Gemini)
   ────────────────────────────         ─────────────────────
   • počíta VŠETKY tempá                • rozhoduje „čo a kedy"
   • štruktúra tréningu                 • adaptácia na dennú formu
   • guardraily (bezpečné limity)       • komunikácia po slovensky
            │                                    │
            └──────────────┬─────────────────────┘
                           ▼
                  Presné, konzistentné plány
                  (LLM nikdy nepočíta tempá → žiadne halucinácie)
```
Tempá a štruktúru počíta deterministický kód (single source of truth), LLM sa stará len o rozhodovanie a komunikáciu. Výsledok: plány sú vždy metodicky presné, no zároveň prispôsobené realite bežca.
🧰 Tech stack
Vrstva	Technológie
Frontend	Next.js 16 · React 19 · TypeScript · Tailwind CSS 4
Backend	FastAPI (Python) · Gemini LLM
Dáta / Auth	Supabase (Postgres + Auth) · šifrovanie (Fernet)
Integrácie	Garmin Connect API
Deploy	Render (API) · Vercel (frontend)
🚀 Lokálne spustenie
```bash
# Backend
cd backend
cp .env.example .env        # vyplň vlastné kľúče (Gemini, Supabase, Fernet)
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
cp .env.example .env.local  # doplň Supabase a API URL
npm install
npm run dev
```
Detailný návod: `docs/SETUP.md`. Metodika: `docs/HANSON_METHODOLOGY_AND_REDESIGN.md`.
> 🔐 **Bezpečnosť:** žiadne tajomstvá nie sú v repozitári — všetko cez env premenné (`.env` je v `.gitignore`).
---
Postavené ako osobný projekt — dôkaz, že s AI nástrojmi viem navrhnúť a doručiť funkčný full-stack produkt od nuly po nasadenie.
