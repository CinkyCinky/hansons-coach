# Setup & Infra — Hansons Coach

Mapa toho, **čo beží kde** a **odkiaľ vziať ktorú hodnotu**. Slúži na rozbeh na novom
počítači. **Žiadne tajomstvá nie sú v tomto súbore ani v gite** — hodnoty sú vždy len
v dashboardoch nižšie.

## Architektúra

| Časť | Beží na | URL |
|---|---|---|
| Frontend (Next.js PWA) | Vercel | https://hansons-coach.vercel.app |
| Backend (FastAPI) | Render (`hansons-coach-api`) | https://hansons-backend.onrender.com |
| Databáza + Auth | Supabase | (Supabase dashboard) |
| AI tréner / generátor | Google Gemini (google-genai) | — |
| Keep-alive (proti cold startu) | UptimeRobot → `/keepalive` | interval 5 min, **HEAD** |

Deploy: **push na `main` → auto-deploy** (Vercel = frontend, Render = backend).

## Premenné prostredia — kde sú nastavené a odkiaľ ich vziať

Zdroj pravdy pre produkciu = **Render / Vercel** env. Hodnoty pochádzajú zo **Supabase → Settings → API**
a **Google AI Studio**.

### Backend (Render → `hansons-coach-api` → Environment)

| Premenná | Odkiaľ hodnota |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio → API keys (https://aistudio.google.com/apikey) |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_KEY` | Supabase → Settings → API |
| `ENCRYPTION_KEY` | ⚠️ len v Render env — **zálohovať** (viď nižšie) |
| `FRONTEND_URL` | Vercel URL (`https://hansons-coach.vercel.app`) |
| `GEMINI_MODEL_FLASH/PRO/PLAN` | voliteľné — prepnutie modelov (majú defaulty) |

### Frontend (Vercel → projekt → Settings → Environment Variables)

| Premenná | Odkiaľ hodnota |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon/public key |
| `NEXT_PUBLIC_API_URL` | `https://hansons-backend.onrender.com` |

> Garmin prihlásenie sa **nezadáva ako env** — ukladá sa šifrovane per-user v Supabase
> tabuľke `profiles` (zadáva sa v appke v Nastaveniach).

## ⚠️ ENCRYPTION_KEY — jediné nenahraditeľné tajomstvo

Je to Fernet kľúč, ktorým sa **šifrujú Garmin heslá** používateľov. Nemá externý zdroj —
žije len v Render env. **Ak sa stratí, uložené Garmin heslá sa už nedajú dešifrovať.**
→ Skopíruj si ho z Renderu do **password manažéra** (Bitwarden/1Password). Nikdy nie do gitu ani do chatu.

Nový kľúč (len pri čistom starte, znehodnotí staré heslá):
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Lokálny rozbeh na novom počítači

Predpoklad: nainštalovaný Python 3.12 a Node 20+.

**Backend:**
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env    # potom .env vyplň hodnotami z Render dashboardu
.\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

**Frontend:**
```powershell
cd frontend
npm install
# .env.local vyplň NEXT_PUBLIC_* hodnotami z Vercel dashboardu
npm run dev
```

`.env` aj `.env.local` sú v `.gitignore` — **necommitovať**.

## Bezpečnostné pravidlá

- Tajomstvá **nikdy** do gitu, do chatu s asistentom, ani do `.env.example`.
- Zdroj pravdy = dashboardy (Render/Vercel/Supabase) — dostupné z ktoréhokoľvek počítača.
- `.env` je vždy len lokálny, vyplnený skopírovaním z dashboardu.
