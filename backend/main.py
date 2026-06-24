from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import datetime
import json
import logging
import os
import sys
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load env variables
load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from modules.auth import get_client
from modules import fetcher
from modules.database import (
    verify_token, get_user_profile, update_user_profile, encrypt_password,
    get_garmin_snapshot, save_garmin_snapshot,
    save_metric_history, get_metric_history,
    get_memory_facts, add_memory_fact, delete_memory_fact,
)
from modules import workout_generator
from modules import hansons_knowledge

app = FastAPI(title="Hansons Running Coach API", version="2.0.0")
security = HTTPBearer()

FRONTEND_URL = os.getenv("FRONTEND_URL", "").rstrip("/")
allowed_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
]
if FRONTEND_URL:
    allowed_origins.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    # Len explicitné originy: localhost (vývoj) + presná FRONTEND_URL (produkcia).
    # Žiadny "*" ani broad "*.vercel.app" regex — ten by povolil aj cudzie vercel.app projekty.
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup Gemini AI (nová zjednotená google-genai SDK)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

# Mapovanie UI prepínača (flash/pro) na Gemini 3.x modely:
#   flash = rýchly, stabilný tréner (Gemini 3.5 Flash)
#   pro   = najsilnejšie uvažovanie + 2M kontext (Gemini 3.1 Pro — preview)
# Cez ENV sa dá kedykoľvek prepnúť model (napr. z preview na stabilný gemini-2.5-pro)
# bez zásahu do kódu — stačí nastaviť GEMINI_MODEL_PRO / GEMINI_MODEL_FLASH na Render.
GEMINI_MODELS = {
    "flash": os.getenv("GEMINI_MODEL_FLASH", "gemini-3.5-flash"),
    "pro": os.getenv("GEMINI_MODEL_PRO", "gemini-3.1-pro-preview"),
}

logger = logging.getLogger("hansons")


def _server_error(e: Exception, message: str) -> HTTPException:
    """Zaloguje skutočnú chybu na server (nie klientovi) a vráti čistú slovenskú správu."""
    logger.exception("%s", message)
    return HTTPException(status_code=500, detail=message)


# ── Models ──────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(max_length=4000)               # strop dĺžky správy (anti-abuse)
    history: List[Dict[str, str]] = Field(default_factory=list, max_length=80)
    model: str = "flash"  # "flash" | "pro"
    local_time: Optional[str] = None

class ProfileUpdate(BaseModel):
    garmin_email: Optional[str] = None
    garmin_password: Optional[str] = None
    target_time: Optional[str] = None
    training_start_date: Optional[str] = None  # YYYY-MM-DD
    race_date: Optional[str] = None  # YYYY-MM-DD
    ai_context: Optional[str] = None
    display_name: Optional[str] = None
    plan_variant: Optional[str] = None  # "advanced" | "beginner" | "just_finish"


class MemoryFactRequest(BaseModel):
    content: str = Field(min_length=1, max_length=500)
    category: str = "note"


# ── Auth helpers ─────────────────────────────────────────────────────────────

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Neplatný token. Prosím prihláste sa znova.")
    return user.id

def get_garmin_client(user_id: str = Depends(get_current_user)):
    try:
        client = get_client(user_id)
        return client
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Garmin prihlásenie zlyhalo: {str(e)}")


# ── Utility ──────────────────────────────────────────────────────────────────

def _calculate_training_week(profile: dict) -> int:
    """Aktuálny týždeň prípravy (1-18). Jediný zdroj pravdy = hansons_knowledge
    (týždeň sa mení v pondelok, nie v deň štartu prípravy)."""
    return hansons_knowledge.current_training_week(profile)


def _scheduled_items(scheduled) -> list:
    """Normalizuje odpoveď get_scheduled_workouts na zoznam položiek kalendára."""
    if isinstance(scheduled, dict):
        return scheduled.get("calendarItems", scheduled.get("workoutScheduledDTOList", [])) or []
    return scheduled or []


def _is_planned_workout(item: dict) -> bool:
    """True len pre reálne naplánované tréningy (nie aktivity, váhy, eventy)."""
    return item.get("itemType") == "workout" and bool(item.get("workoutId"))


def _is_sos_title(title: str) -> bool:
    """Heuristika: je to kľúčový (SOS) tréning? Speed/Strength/Tempo/Dlhý beh/intervaly."""
    t = (title or "").lower()
    return any(k in t for k in ("tempo", "speed", "strength", "sila", "interval", "long", "dlh", "rýchlost", "rychlost"))


def _get_scheduled_range(client, start: datetime.date, end: datetime.date) -> list:
    """Stiahne a zlúči naplánované tréningy naprieč viacerými mesiacmi (Garmin API vracia 1 mesiac)."""
    items, seen = [], set()
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        try:
            for it in _scheduled_items(client.get_scheduled_workouts(y, m)):
                key = it.get("id") or (it.get("workoutId"), it.get("date"))
                if key not in seen:
                    seen.add(key)
                    items.append(it)
        except Exception:
            pass
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return items


def _parse_workout_step(step: dict):
    """Zhrnutie jedného executable kroku. Vráti (row, distance_m)."""
    step_type = (step.get("stepType") or {}).get("stepTypeKey", "run")
    cond = (step.get("endCondition") or {}).get("conditionTypeKey")
    raw_val = step.get("endConditionValue") or 0
    # endConditionValue je v metroch LEN pre distance kroky (inak sekundy/kalórie/lap)
    dist_m = raw_val if cond == "distance" else 0
    dist_km = round(dist_m / 1000, 2) if dist_m else None
    duration_min = round(raw_val / 60, 1) if cond == "time" and raw_val else None

    notes = step.get("description") or step.get("stepNotes") or step.get("notes") or ""
    target_type = str((step.get("targetType") or {}).get("workoutTargetTypeKey") or "")
    t_low = step.get("targetValueOne")
    t_high = step.get("targetValueTwo")
    target_str, target_kind = "", "none"
    if "heart" in target_type.lower() and t_low and t_high:
        target_str = f"{int(t_low)}-{int(t_high)} bpm"
        target_kind = "hr"
    elif t_low and t_high and float(t_low) > 0:
        try:
            p_fast = round(1000 / float(t_high))
            p_slow = round(1000 / float(t_low))
            target_str = f"{p_fast // 60}:{p_fast % 60:02d}-{p_slow // 60}:{p_slow % 60:02d}/km"
            target_kind = "pace"
        except Exception:
            pass
    return {
        "type": step_type,
        "distance_km": dist_km,
        "duration_min": duration_min,
        "target": target_str,
        "target_kind": target_kind,
        "notes": notes,
    }, dist_m


def _flatten_workout_steps(steps):
    """Rekurzívne rozbalí kroky vrátane 'repeat' skupín (vnorené intervaly).
    Vráti (rows, total_distance_m)."""
    rows, total_m = [], 0.0
    for step in steps or []:
        step_key = (step.get("stepType") or {}).get("stepTypeKey", "")
        children = step.get("workoutSteps")
        if step_key == "repeat" or children:
            iters = int(step.get("numberOfIterations") or step.get("endConditionValue") or 1)
            for _ in range(max(1, iters)):
                child_rows, child_m = _flatten_workout_steps(children)
                rows.extend(child_rows)
                total_m += child_m
        else:
            row, dist_m = _parse_workout_step(step)
            rows.append(row)
            total_m += dist_m
    return rows, total_m


# ── Garmin denný snapshot cache ───────────────────────────────────────────────
# Pomaly sa meniace wellness dáta cachujeme raz denne do Supabase (garmin_snapshots).
# Šetrí to opakovaný drahý fan-out na Garmin (najmä chat = ~10 volaní/správa) a 429,
# a prežije aj "uspanie" Render free tieru.
SNAPSHOT_TTL_MIN = 30  # intradenné zmeny BB/readiness sú malé; Refresh na dashboarde cache obíde


def _snapshot_fresh(fetched_at_str, ttl_min: int = SNAPSHOT_TTL_MIN) -> bool:
    try:
        ts = datetime.datetime.fromisoformat(str(fetched_at_str).replace("Z", "+00:00"))
        return (datetime.datetime.now(datetime.timezone.utc) - ts).total_seconds() < ttl_min * 60
    except Exception:
        return False


def _build_wellness(client) -> dict:
    """Pozbiera pomaly sa meniace wellness dáta (drahý fan-out na Garmin)."""
    lthr_data = fetcher.get_lactate_threshold(client) or {}
    athlete = fetcher.get_athlete_profile(client) or {}
    stats = fetcher.get_stats_summary(client) or {}
    base_max_hr = fetcher.get_max_hr_from_activities(client, days=90)
    hr_zones = fetcher.resolve_hr_zones(
        client,
        lthr=lthr_data.get("lthr") or athlete.get("lthr"),
        max_hr=base_max_hr,
        resting_hr=stats.get("resting_hr"),
    )
    return {
        "sleep": fetcher.get_sleep_data(client, days=7) or [],
        "hrv": fetcher.get_hrv_data(client) or {},
        "body_battery": fetcher.get_body_battery(client) or {},
        "readiness": fetcher.get_training_readiness(client) or {},
        "stats": stats,
        "training_load": fetcher.get_training_load(client) or {},
        "lthr": lthr_data,
        "athlete": athlete,
        "hr_zones": hr_zones,
        "max_hr": (hr_zones or {}).get("max_hr") or base_max_hr,
    }


def _record_metric_history(user_id: str, wellness: dict):
    """Zapíše denný bod trendov (vo2max / pokojový tep / A:C ratio) z wellness dát."""
    try:
        tl = wellness.get("training_load") or {}
        ratio = tl.get("ratio")
        if ratio in (None, 0) and tl.get("acute_load") and tl.get("chronic_load"):
            try:
                ratio = round(tl["acute_load"] / tl["chronic_load"], 2)
            except Exception:
                ratio = None
        save_metric_history(
            user_id,
            vo2max=(wellness.get("athlete") or {}).get("vo2max"),
            resting_hr=(wellness.get("stats") or {}).get("resting_hr"),
            ac_ratio=ratio,
            hrv=(wellness.get("hrv") or {}).get("last_night"),
        )
    except Exception:
        logger.exception("Zápis trendov zlyhal")


def _wellness_snapshot(client, user_id: str, force: bool = False) -> dict:
    """Wellness snapshot z cache (ak je čerstvý), inak ho stiahne z Garminu a uloží."""
    if not force:
        cached = get_garmin_snapshot(user_id)
        if cached and cached.get("data") and _snapshot_fresh(cached.get("fetched_at")):
            return cached["data"]
    data = _build_wellness(client)
    save_garmin_snapshot(user_id, data)
    _record_metric_history(user_id, data)
    return data


# ── Basic endpoints ───────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"status": "ok", "app": "Hansons Running Coach", "version": "2.0.0"}

@app.get("/keepalive")
def keepalive():
    """Endpoint pre UptimeRobot — zabraňuje cold startu na Render free tieri."""
    return {"ok": True, "timestamp": datetime.datetime.now().isoformat()}


# ── Profile ──────────────────────────────────────────────────────────────────

@app.get("/api/profile")
def get_profile(user_id: str = Depends(get_current_user)):
    profile = get_user_profile(user_id)
    if not profile:
        return {
            "id": user_id,
            "garmin_email": None,
            "target_time": "1:50:00",
            "training_start_date": "2026-06-01",
        }
    # Skry zašifrované heslo
    profile.pop("garmin_password_encrypted", None)
    profile.pop("garmin_tokens", None)
    return profile

@app.post("/api/profile")
def update_profile(req: ProfileUpdate, user_id: str = Depends(get_current_user)):
    try:
        update_data = {}
        if req.garmin_email is not None:
            update_data["garmin_email"] = req.garmin_email
        if req.garmin_password:
            update_data["garmin_password_encrypted"] = encrypt_password(req.garmin_password)
        if req.target_time is not None:
            update_data["target_time"] = req.target_time
        if req.training_start_date is not None:
            update_data["training_start_date"] = req.training_start_date
        if req.race_date is not None:
            update_data["race_date"] = req.race_date
        if req.ai_context is not None:
            update_data["ai_context"] = req.ai_context
        if req.display_name is not None:
            update_data["display_name"] = req.display_name
        if req.plan_variant is not None:
            update_data["plan_variant"] = req.plan_variant

        updated = update_user_profile(user_id, update_data)
        return {"status": "success", "profile": updated}
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(error_details)
        raise HTTPException(status_code=400, detail=str(e))


# ── Pamäť trénera (štruktúrované fakty) ───────────────────────────────────────

@app.get("/api/memory")
def list_memory(user_id: str = Depends(get_current_user)):
    """Vráti štruktúrované fakty pamäte trénera."""
    return {"facts": get_memory_facts(user_id)}


@app.post("/api/memory")
def create_memory(req: MemoryFactRequest, user_id: str = Depends(get_current_user)):
    """Pridá jeden fakt do pamäte trénera."""
    fact = add_memory_fact(user_id, req.content.strip(), req.category or "note")
    if not fact:
        raise HTTPException(status_code=500, detail="Fakt sa nepodarilo uložiť (skontroluj tabuľku athlete_memory).")
    return {"fact": fact}


@app.delete("/api/memory/{fact_id}")
def remove_memory(fact_id: str, user_id: str = Depends(get_current_user)):
    """Vymaže fakt z pamäte trénera."""
    delete_memory_fact(user_id, fact_id)
    return {"status": "deleted"}


# ── Dashboard ────────────────────────────────────────────────────────────────

@app.get("/api/dashboard/today")
def get_dashboard_today(
    refresh: bool = False,
    user_id: str = Depends(get_current_user),
    client=Depends(get_garmin_client),
):
    """Vráti dnešné dáta (Spánok, HRV, Body Battery, Pripravenosť) + posledné aktivity.
    ?refresh=true obíde denný cache a stiahne čerstvé dáta z Garminu."""
    today = datetime.datetime.now().strftime("%Y-%m-%d")

    try:
        profile = get_user_profile(user_id) or {}
        training_week = _calculate_training_week(profile)

        snap = _wellness_snapshot(client, user_id, force=refresh)
        sleep = snap["sleep"][0] if snap["sleep"] else {}
        hrv = snap["hrv"]
        stats = snap["stats"]
        readiness = snap["readiness"]
        bb = snap["body_battery"]
        training_load = snap["training_load"]
        activities = fetcher.get_recent_activities(client, days=7)  # čerstvé (odráža nové behy)

        # Dnešný naplánovaný tréning
        today_workout = None
        try:
            now = datetime.datetime.now()
            items = _scheduled_items(client.get_scheduled_workouts(now.year, now.month))
            today_str = datetime.date.today().strftime("%Y-%m-%d")
            today_items = [
                i for i in items
                if (i.get("date") or "")[:10] == today_str and _is_planned_workout(i)
            ]
            if today_items:
                today_workout = today_items[0]
        except Exception:
            pass

        # Filtrovať posledné aktivity - iba bežecké typy
        running_types = ("running", "track_running", "treadmill_running", "trail_running")
        running_activities = [
            a for a in (activities or [])
            if (a.get("activityType", {}).get("typeKey") or "").lower() in running_types
        ]
        # Zaokrúhliť HR na celé číslo
        for act in running_activities:
            if act.get("averageHR"):
                act["averageHR"] = round(act["averageHR"])

        return {
            "date": today,
            "training_week": training_week,
            "plan_variant": profile.get("plan_variant", "advanced"),
            "display_name": profile.get("display_name"),
            "garmin_email": profile.get("garmin_email"),
            "sleep": sleep,
            "hrv": hrv,
            "stats": {
                **stats,
                "body_battery": bb.get("today_charged"),
            },
            "readiness": {
                "readiness_score": readiness.get("score"),
                "readiness_status": readiness.get("level"),
                "feedback": readiness.get("feedback", ""),
            },
            "training_load": training_load,
            "activities": running_activities[:5],
            "today_workout": today_workout,
        }
    except Exception as e:
        raise _server_error(e, "Nepodarilo sa načítať dáta z Garminu.")


def _run_summary(act: dict) -> str:
    """Krátky popis behu: vzdialenosť + priemerný tep (ak sú k dispozícii)."""
    km = (act.get("distance") or 0) / 1000
    parts = [f"{km:.1f} km"] if km else []
    if act.get("averageHR"):
        parts.append(f"{round(act['averageHR'])} bpm")
    return ", ".join(parts) or "beh"


def _training_context_block(client) -> str:
    """Zostaví slovenský kontext pre AI radu: dnešný plán, čo bolo včera (splnené/
    vynechané/voľno), objem za posledných 7 dní + vynechané kľúčové (SOS) tréningy,
    a najbližší tréning ak dnes nič nie je naplánované."""
    today = datetime.date.today()
    yest = today - datetime.timedelta(days=1)
    week_ago = today - datetime.timedelta(days=7)
    today_str, yest_str, week_ago_str = (d.strftime("%Y-%m-%d") for d in (today, yest, week_ago))
    running_types = ("running", "track_running", "treadmill_running", "trail_running")

    try:
        items = _get_scheduled_range(client, week_ago, today + datetime.timedelta(days=14))
        planned = [i for i in items if _is_planned_workout(i)]
    except Exception:
        planned = []

    # Absolvované behy (date -> aktivita) za posledných 8 dní
    runs_by_date: dict = {}
    try:
        for a in (fetcher.get_recent_activities(client, days=8) or []):
            if (a.get("activityType", {}).get("typeKey") or "").lower() in running_types:
                runs_by_date.setdefault((a.get("startTimeLocal") or "")[:10], a)
    except Exception:
        pass

    def _planned_on(day_str: str):
        hits = [i for i in planned if (i.get("date") or "")[:10] == day_str]
        return hits[0] if hits else None

    lines = []

    # DNES — zisti či bol tréning splnený a/alebo prepočítaný
    today_plan = _planned_on(today_str)
    today_run = runs_by_date.get(today_str)
    if today_plan:
        title = today_plan.get("title") or "Beh"
        is_modified = any(kw in title.lower() for kw in ("modified", "softened", "upravený", "updated"))
        if today_run:
            extra = _run_summary(today_run)
            lines.append(
                f"Dnešný tréning ({title}) — SPLNENÝ DNES ({extra}). "
                "Tréning bol DOKONČENÝ — nepredkladaj ďalšiu úpravu."
            )
        elif is_modified:
            lines.append(
                f"Dnešný plán: {title} — tréning bol PREPOČÍTANÝ AI (čaká na absolvovanie). "
                "Nepodporuj ďalší prepočet."
            )
        else:
            lines.append(f"Dnešný plán: {title}.")
    else:
        nxt = sorted(
            [i for i in planned if (i.get("date") or "")[:10] > today_str],
            key=lambda x: x.get("date") or "",
        )
        if nxt:
            lines.append(f"Dnes je voľno. Najbližší tréning: {nxt[0].get('date')} — {nxt[0].get('title') or 'Beh'}.")
        else:
            lines.append("Dnes je voľno, žiadny tréning naplánovaný.")

    # VČERA
    y_plan = _planned_on(yest_str)
    y_run = runs_by_date.get(yest_str)
    if y_plan:
        title = y_plan.get("title") or "Beh"
        if y_run or y_plan.get("activityId"):
            extra = _run_summary(y_run) if y_run else "zaznamenané"
            lines.append(f"Včera ({title}) — SPLNENÉ ({extra}).")
        else:
            sos = " — KĽÚČOVÝ (SOS)!" if _is_sos_title(title) else ""
            lines.append(f"Včera VYNECHANÝ tréning: {title}{sos}.")
    elif y_run:
        lines.append(f"Včera neplánovaný beh ({_run_summary(y_run)}).")
    else:
        lines.append("Včera bez behu (voľno/oddych).")

    # POSLEDNÝCH 7 DNÍ — objem + vynechané SOS
    past_runs = [a for d, a in runs_by_date.items() if week_ago_str <= d < today_str]
    total_km = sum((a.get("distance") or 0) for a in past_runs) / 1000
    missed_sos = sum(
        1 for i in planned
        if week_ago_str <= (i.get("date") or "")[:10] < today_str
        and not ((i.get("date") or "")[:10] in runs_by_date or i.get("activityId"))
        and _is_sos_title(i.get("title") or "")
    )
    summary = f"Posledných 7 dní: {len(past_runs)} behov, ~{total_km:.0f} km."
    if missed_sos:
        summary += f" Vynechané kľúčové (SOS): {missed_sos}."
    lines.append(summary)

    return "Tréningový kontext:\n- " + "\n- ".join(lines)


class AdviceRequest(BaseModel):
    sleep_score: Optional[int] = None
    hrv_status: Optional[str] = None
    body_battery: Optional[int] = None
    readiness: Optional[int] = None

@app.post("/api/dashboard/advice")
def get_dashboard_advice(
    metrics: AdviceRequest,
    user_id: str = Depends(get_current_user),
    client=Depends(get_garmin_client),
):
    """Generuje krátku AI radu na základe dnešných metrík a najbližšieho tréningu."""
    if not GEMINI_API_KEY:
        return {"advice": "Pre plnohodnotné rady si nastav Gemini API kľúč."}

    try:
        # Tréningový kontext (dnešný plán, včerajšok, posledných 7 dní)
        context_block = ""
        try:
            context_block = _training_context_block(client)
        except Exception:
            pass

        # Vypočítaj stav formy (0-100) pre prompt
        values = [v for v in [metrics.sleep_score, metrics.body_battery, metrics.readiness] if v is not None]
        form_score = int(sum(values) / len(values)) if values else 50

        # Tréningová záťaž (acute:chronic) — kľúčový Hanson ukazovateľ preťaženia
        load_note = ""
        try:
            load_note = hansons_knowledge.training_load_block(fetcher.get_training_load(client))
        except Exception:
            pass

        prompt = f"""Si bežecký tréner (Hansonova metóda). Prihováraj sa zverencovi priamo (tykaj mu).
Daj mu osobnú radu na dnešný deň: 2-4 krátke úderné vety. Zohľadni v nej:
- jeho dnešnú formu a ranné metriky,
- čo robil včera (či splnil/vynechal tréning, alebo mal voľno) — nadviaž na to,
- jeho objem a priebeh za posledných 7 dní (najmä vynechané kľúčové SOS tréningy),
- čo má (ne)naplánované dnes — buď ho naladí na dnešný tréning, alebo pri voľne odporuč regeneráciu.
Ak sú hodnoty slabé (Body Battery alebo Pripravenosť pod 50) A z kontextu NEVYPLÝVA, že dnešný tréning
bol SPLNENÝ alebo PREPOČÍTANÝ — vtedy a JEN vtedy odporúč zvážiť prepočet v sekcii Plán.
NIKDY neodporúčaj prepočítať tréning ak kontext hovorí "SPLNENÝ DNES" alebo "PREPOČÍTANÝ AI" —
v takom prípade skôr pochváľ zverenca alebo ho naladí na ďalší deň.
Ak sú hodnoty super, povzbuď ho. Pokojne pridaj 1 emoji.

DÔLEŽITÉ: Odpovedz VÝHRADNE po slovensky. Vráť len samotnú radu pre bežca —
žiadne uvažovanie, úvod, nadpis, číslovanie ani angličtinu.

Stav formy dnes: {form_score}/100
- Spánok skóre: {metrics.sleep_score}/100
- HRV: {metrics.hrv_status}
- Body Battery: {metrics.body_battery}/100
- Pripravenosť: {metrics.readiness}/100
{load_note}{context_block}"""

        # thinking_level="low" — krátka rada nepotrebuje hlboké uvažovanie. POZOR: pri
        # Gemini 3 sa thinking tokeny počítajú do max_output_tokens, preto musí byť limit
        # dosť vysoký, aby po (skrátenom) uvažovaní zostal priestor na celú slovenskú radu —
        # inak sa odpoveď odsekne. 2048 dáva pohodlnú rezervu pre 2–4 vety + thinking.
        response = gemini_client.models.generate_content(
            model=GEMINI_MODELS["flash"],
            contents=prompt,
            config=types.GenerateContentConfig(
                max_output_tokens=2048,
                temperature=0.7,
                thinking_config=types.ThinkingConfig(thinking_level="low"),
            ),
        )
        advice_text = (response.text or "").strip()
        return {"advice": advice_text or "Dnes ťa neviem zhodnotiť, bež podľa pocitu! 🏃‍♂️"}
    except Exception:
        logger.exception("Generovanie AI rady zlyhalo")
        return {"advice": "Dnes ťa neviem zhodnotiť, bež podľa pocitu! 🏃‍♂️"}


# ── Plan ─────────────────────────────────────────────────────────────────────

@app.get("/api/plan/scheduled")
def get_scheduled_plan(user_id: str = Depends(get_current_user), client=Depends(get_garmin_client)):
    """Vráti naplánované tréningy + absolvované behy za celé obdobie prípravy (Hanson 18 týž.)."""
    today = datetime.date.today()
    profile = get_user_profile(user_id) or {}
    # Okno plánu = od začiatku prípravy po preteky (nie arbitrárny počet dní)
    try:
        start = datetime.date.fromisoformat(str(profile.get("training_start_date"))[:10])
    except Exception:
        start = today - datetime.timedelta(days=126)  # default 18 týž. dozadu
    try:
        end = datetime.date.fromisoformat(str(profile.get("race_date"))[:10])
    except Exception:
        end = today + datetime.timedelta(days=150)
    if end < today:
        end = today + datetime.timedelta(days=30)
    # Poistka proti extrémom (Garmin API limit aktivít ~200)
    if (today - start).days > 220:
        start = today - datetime.timedelta(days=220)
    try:
        items = _get_scheduled_range(client, start - datetime.timedelta(days=7), end)
        # Zobrazíme len reálne naplánované tréningy (nie aktivity, váhy, tenis, eventy)
        items = [i for i in items if _is_planned_workout(i)]

        today_str = today.strftime("%Y-%m-%d")
        try:
            running_types = ("running", "track_running", "treadmill_running", "trail_running")
            # Absolvované behy od začiatku prípravy (nie pevných 40 dní)
            lookback = max(14, (today - start).days + 1)
            recent_activities = fetcher.get_recent_activities(client, days=lookback) or []
            runs = [
                a for a in recent_activities
                if (a.get("activityType", {}).get("typeKey") or "").lower() in running_types
            ]
            runs_by_date: Dict[str, list] = {}
            for a in runs:
                d = (a.get("startTimeLocal") or "")[:10]
                if d:
                    runs_by_date.setdefault(d, []).append(a)

            # 1) Naplánovaným minulým tréningom priraď splnenú aktivitu (zelená fajka)
            used_ids = set()
            for item in items:
                item_date = (item.get("date") or "")[:10]
                if item_date and item_date < today_str and not item.get("activityId"):
                    day_runs = runs_by_date.get(item_date, [])
                    if day_runs:
                        chosen = day_runs[0]
                        item["activityId"] = chosen.get("activityId")
                        item["activityName"] = chosen.get("activityName", "")
                        used_ids.add(chosen.get("activityId"))

            # 2) Pridaj absolvované behy, ktoré nepatria k žiadnemu naplánovanému tréningu
            for a in runs:
                aid = a.get("activityId")
                if aid in used_ids:
                    continue
                d = (a.get("startTimeLocal") or "")[:10]
                if not d:
                    continue
                items.append({
                    "date": d,
                    "title": a.get("activityName") or "Beh",
                    "activityId": aid,
                    "activityName": a.get("activityName") or "Beh",
                    "itemType": "activity",
                    "sportType": {"typeKey": "Beh"},
                })
        except Exception as enrich_err:
            print(f"Activity enrichment failed: {enrich_err}")

        return {"workouts": items}
    except Exception as e:
        raise _server_error(e, "Nepodarilo sa načítať tréningový plán.")


@app.get("/api/plan/workout/{workout_id}")
def get_workout_details(workout_id: str, client=Depends(get_garmin_client)):
    """Detailné info o konkrétnom tréningu — kroky, HR targety, poznámky."""
    try:
        # Rôzne verzie garminconnect API majú rôzne názvy metódy
        if hasattr(client, 'get_workout_by_id'):
            details = client.get_workout_by_id(workout_id)
        elif hasattr(client, 'get_workout'):
            details = client.get_workout(workout_id)
        else:
            # Fallback: priamo cez interný session
            url = f"https://connect.garmin.com/workout-service/workout/{workout_id}"
            details = client.connectapi(url)
        if not isinstance(details, dict):
            return {"workout": details}

        workout_notes = (
            details.get("description")
            or details.get("workoutNotes")
            or details.get("workoutDescription")
            or ""
        )

        steps_summary = []
        total_dist_m = 0.0
        for seg in details.get("workoutSegments") or []:
            seg_rows, seg_m = _flatten_workout_steps(seg.get("workoutSteps"))
            steps_summary.extend(seg_rows)
            total_dist_m += seg_m

        enriched = {
            **details,
            "description": workout_notes,
            "workoutName": details.get("workoutName", ""),
            "total_distance_km": round(total_dist_m / 1000, 1) if total_dist_m else None,
            "steps_summary": steps_summary,
        }
        return {"workout": enriched}
    except Exception as e:
        raise _server_error(e, "Nepodarilo sa načítať detail tréningu.")


@app.get("/api/plan/activity/{activity_id}")
def get_activity_stats(activity_id: str, client=Depends(get_garmin_client)):
    """Skutočné štatistiky splnenej aktivity."""
    try:
        details = client.get_activity(activity_id)
        splits = None
        try:
            splits = client.get_activity_splits(activity_id)
        except Exception:
            pass

        summary = details.get("summaryDTO", {})
        avg_speed = summary.get("averageSpeed")
        avg_pace_sec = round(1000 / avg_speed) if avg_speed else None

        stats = {
            "distance_km": round((summary.get("distance") or 0) / 1000, 2) or None,
            "duration_min": round((summary.get("duration") or 0) / 60, 1) or None,
            "avg_pace_sec_km": avg_pace_sec,
            "avg_hr": round(summary["averageHR"]) if summary.get("averageHR") else None,
            "max_hr": round(summary["maxHR"]) if summary.get("maxHR") else None,
            "avg_cadence": round(c) if (c := (
                summary.get("averageRunningCadenceInStepsPerMinute")
                or summary.get("averageCadence")
            )) else None,
            "total_ascent": summary.get("elevationGain"),
            "calories": summary.get("calories"),
            "training_effect": summary.get("trainingEffect"),
            "splits": splits.get("lapDTOs") if splits and isinstance(splits, dict) else None,
        }
        return {"stats": stats, "activity": details}
    except Exception as e:
        raise _server_error(e, "Nepodarilo sa načítať štatistiky aktivity.")


class PlanGenerateRequest(BaseModel):
    constraints: str

@app.post("/api/plan/generate")
def api_generate_plan(
    req: PlanGenerateRequest,
    user_id: str = Depends(get_current_user),
    client=Depends(get_garmin_client),
):
    profile = get_user_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profil nenájdený")
    try:
        # client → AI dostane živé dáta (vek/váha/VO2max/LTHR/HR zóny) + plnú metodiku
        plan_json = workout_generator.generate_weekly_plan(profile, req.constraints, client)
        # Meta pre "i" panel v UI: z čoho sú tempá počítané (transparentnosť/dôvera)
        try:
            vo2 = (fetcher.get_athlete_profile(client) or {}).get("vo2max")
            paces = hansons_knowledge.compute_training_paces(profile.get("target_time", ""), vo2)
            if paces:
                plan_json["paces"] = {
                    **paces,
                    "vo2max": vo2,
                    "target_time": profile.get("target_time"),
                    "variant": hansons_knowledge.variant_label(profile.get("plan_variant")),
                    "training_week": _calculate_training_week(profile),
                }
        except Exception:
            pass
        return plan_json
    except Exception as e:
        raise _server_error(e, "Nepodarilo sa vygenerovať plán. Skús to znova.")


class PlanUploadRequest(BaseModel):
    plan_data: dict

def _is_rate_limited(e: Exception) -> bool:
    return "429" in str(e) or "rate" in str(e).lower() or "too many" in str(e).lower()


def _garmin_write(fn, *args, attempts: int = 4):
    """Zápisové Garmin volanie s exponenciálnym backoffom pri 429 (Garmin agresívne
    rate-limituje). Pri inej chybe vyhodí hneď."""
    import time
    last = None
    for i in range(attempts):
        try:
            return fn(*args)
        except Exception as e:
            last = e
            if _is_rate_limited(e) and i < attempts - 1:
                time.sleep(1.0 + 1.5 * i)  # 1.0s, 2.5s, 4.0s
                continue
            raise
    if last:
        raise last


def _clear_planned_on_dates(client, dates: set) -> None:
    """Zmaže existujúce naplánované tréningy na cieľových dátumoch. Scheduled workouts
    načíta RAZ za každý dotknutý mesiac (nie za každý dátum) — šetrí Garmin volania a
    znižuje riziko rate-limitu."""
    months = set()
    for d in dates:
        try:
            dd = datetime.date.fromisoformat(d)
            months.add((dd.year, dd.month))
        except Exception:
            pass
    for (y, m) in months:
        try:
            items = _scheduled_items(client.get_scheduled_workouts(y, m))
        except Exception:
            continue
        for it in items:
            if (it.get("date") or "")[:10] in dates and _is_planned_workout(it):
                try:
                    _garmin_write(client.delete_workout, it.get("workoutId"))
                except Exception:
                    logger.exception("Nepodarilo sa zmazať starý tréning %s", it.get("workoutId"))


@app.post("/api/plan/upload")
def api_upload_plan(req: PlanUploadRequest, user_id: str = Depends(get_current_user),
                    client=Depends(get_garmin_client)):
    import time
    try:
        workouts_json = (req.plan_data or {}).get("workouts", []) or []
        if not workouts_json:
            return {"status": "error", "uploaded": [], "failed": [],
                    "message": "Plán neobsahuje žiadne tréningy."}

        # Deterministické Hanson guardraily aj na (ručne upravený) plán pred zápisom:
        # žiadne 2 tvrdé dni za sebou + strop dlhého behu. Fail-open.
        try:
            prof = get_user_profile(user_id) or {}
            _p = hansons_knowledge.compute_training_paces(prof.get("target_time", "")) or {}
            workout_generator.apply_plan_guardrails(req.plan_data, _p.get("easy_min"), _p.get("easy_max"))
            workouts_json = (req.plan_data or {}).get("workouts", []) or []
        except Exception:
            logger.exception("Guardraily na upload zlyhali — pokračujem bez nich")

        # 1) Postav každý tréning zvlášť — chybu STAVBY zachytíme a ukážeme (nepotláčame).
        built, failed = [], []
        for w in workouts_json:
            name = w.get("workout_name", "Beh")
            try:
                d, workout = workout_generator.build_one_garmin_workout(w)
                built.append((d.strftime("%Y-%m-%d"), workout))
            except Exception as e:
                logger.exception("Stavba tréningu '%s' zlyhala", name)
                failed.append({"date": w.get("date"), "name": name,
                               "reason": f"chyba prípravy tréningu: {type(e).__name__}: {str(e)[:180]}"})

        if not built:
            return {"status": "error", "uploaded": [], "failed": failed,
                    "message": "Žiadny tréning sa nepodarilo pripraviť na zápis."}

        # 2) Idempotencia: hromadne zmaž staré tréningy na cieľových dátumoch (1 dotaz/mesiac)
        try:
            _clear_planned_on_dates(client, {ds for ds, _ in built})
        except Exception:
            logger.exception("Čistenie starých tréningov zlyhalo — pokračujem v zápise")

        # 3) Upload + naplánovanie (s retry pri 429 a anti-burst rozložením)
        uploaded = []
        for idx, (date_str, workout) in enumerate(built):
            try:
                resp = _garmin_write(client.upload_running_workout, workout)
                workout_id = (resp or {}).get("workoutId")
                if not workout_id:
                    failed.append({"date": date_str, "name": workout.workoutName,
                                   "reason": "Garmin nevrátil ID tréningu"})
                    continue
                _garmin_write(client.schedule_workout, workout_id, date_str)
                uploaded.append({"date": date_str, "name": workout.workoutName, "id": workout_id})
            except Exception as e:
                logger.exception("Zápis tréningu %s na %s zlyhal", workout.workoutName, date_str)
                reason = "Garmin dočasne limituje požiadavky (429) — skús o chvíľu znova." \
                    if _is_rate_limited(e) else f"{type(e).__name__}: {str(e)[:180]}"
                failed.append({"date": date_str, "name": workout.workoutName, "reason": reason})
            if idx < len(built) - 1:
                time.sleep(0.4)

        status = "success" if uploaded and not failed else ("partial" if uploaded else "error")
        return {"status": status, "uploaded": uploaded, "failed": failed}
    except Exception as e:
        raise _server_error(e, "Nepodarilo sa nahrať plán do Garminu.")


class GoalEstimateRequest(BaseModel):
    race_distance_km: Optional[float] = None
    race_time: Optional[str] = None   # "H:MM:SS" alebo "MM:SS" (preteky)


def _parse_time_to_sec(t: str) -> Optional[int]:
    """'1:45:00' → h:m:s; '48:00' → m:s (pretekový čas). Vráti sekundy."""
    try:
        parts = [int(x) for x in str(t).strip().split(":")]
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        if len(parts) == 2:
            return parts[0] * 60 + parts[1]
    except (TypeError, ValueError):
        pass
    return None


@app.post("/api/plan/goal_estimate")
def api_goal_estimate(req: GoalEstimateRequest, user_id: str = Depends(get_current_user),
                      client=Depends(get_garmin_client)):
    """Odhad realistického polmaratónového cieľa z nedávnych pretekov (Riegel) alebo
    z Garmin VO2max. Slúži ako návrh — používateľ ho môže prijať alebo prepísať."""
    try:
        # 1) Z ručne zadaného nedávneho výsledku pretekov (presnejšie)
        if req.race_distance_km and req.race_time:
            sec = _parse_time_to_sec(req.race_time)
            if sec:
                pred = hansons_knowledge.riegel_predict_sec(float(req.race_distance_km), float(sec))
                if pred:
                    return {"predicted": hansons_knowledge.fmt_hms(pred), "basis": "race",
                            "source": f"z pretekov {req.race_distance_km:g} km ({req.race_time})"}
        # 2) Z Garmin VO2max (vždy dostupné, ak je nameraný)
        vo2 = (fetcher.get_athlete_profile(client) or {}).get("vo2max")
        pred = hansons_knowledge.predict_half_from_vo2max(vo2)
        if pred:
            return {"predicted": hansons_knowledge.fmt_hms(pred), "basis": "vo2max",
                    "vo2max": vo2, "source": f"z Garmin VO2max ({vo2})"}
        return {"predicted": None,
                "message": "Na odhad treba VO2max z Garminu alebo výsledok nedávnych pretekov."}
    except Exception as e:
        raise _server_error(e, "Nepodarilo sa odhadnúť cieľ.")


@app.get("/api/plan/overview")
def api_plan_overview(user_id: str = Depends(get_current_user)):
    """Deterministický prehľad celého 18-týždňového plánu (fáza + predpísané SOS pre
    každý týždeň) podľa variantu používateľa — vzdelávací pohľad na celý oblúk prípravy."""
    try:
        profile = get_user_profile(user_id) or {}
        variant = profile.get("plan_variant", "advanced")
        cur = hansons_knowledge.current_training_week(profile)
        weeks = []
        for wk in range(1, 19):
            ph = hansons_knowledge.training_phase(wk)
            sos = hansons_knowledge.sos_for_week(wk, variant)
            weeks.append({
                "week": wk,
                "phase": ph["key"],
                "is_current": wk == cur,
                "tuesday": (sos.get("tuesday") or {}).get("label") if sos else None,
                "thursday": (sos.get("thursday") or {}).get("label") if sos else None,
                "sunday": (sos.get("sunday") or {}).get("label") if sos else None,
            })
        return {"weeks": weeks, "current_week": cur,
                "variant": hansons_knowledge.variant_label(variant)}
    except Exception as e:
        raise _server_error(e, "Nepodarilo sa načítať prehľad plánu.")


@app.get("/api/plan/daily_update")
def generate_daily_update(feeling: str = "", pain: str = "", pain_area: str = "",
                          client=Depends(get_garmin_client), user_id: str = Depends(get_current_user)):
    """Generuje AI návrh na úpravu najbližšieho tréningu podľa aktuálnej formy (pripravenosť,
    HRV, Body Battery, A:C záťaž), prípadného self-reportu (pocit/bolesť) a Hanson metodiky.
    feeling = ok|tired|pain; pain = sharp|dull; pain_area = voľný text."""
    try:
        profile = get_user_profile(user_id) or {}
        # Stav dňa → dátovo-riadené zmäkčenie (nie len všeobecná inštrukcia)
        form_context = ""
        try:
            snap = _wellness_snapshot(client, user_id)
            r, hrv, bb, tl = snap["readiness"], snap["hrv"], snap["body_battery"], snap["training_load"]
            form_context = (
                "STAV DŇA (pre rozhodnutie o zmäkčení):\n"
                f"- Pripravenosť: {r.get('score', 'N/A')}/100 ({r.get('level', '')})\n"
                f"- HRV: {hrv.get('status', 'N/A')} (last night {hrv.get('last_night', 'N/A')} ms)\n"
                f"- Body Battery: {bb.get('today_charged', 'N/A')}/100\n"
                + hansons_knowledge.training_load_block(tl)
            )
        except Exception:
            pass

        # Self-report zverenca (pocit / bolesť) → silnejší vstup pre rozhodnutie
        sharp_pain = (feeling == "pain" and pain == "sharp")
        if feeling == "pain" or pain:
            area = f" (oblasť: {pain_area})" if pain_area else ""
            if sharp_pain:
                form_context += (
                    f"\nSELF-REPORT: zverenec hlási OSTRÚ / pretrvávajúcu bolesť{area}. "
                    "TVRDÝ tréning je dnes ZAKÁZANÝ — predpíš VÝLUČNE ľahký regeneračný beh alebo voľno, "
                    "žiadne intervaly/tempo. Odporuč sledovať bolesť a v prípade zhoršenia oddych/lekára."
                )
            else:
                form_context += (
                    f"\nSELF-REPORT: zverenec hlási tupú/svalovú bolesť{area} — pri kumulovanej únave "
                    "býva bežná; tréning môže pokračovať, prípadne mierne zmäkči (pomalší okraj, kratšie)."
                )
        elif feeling == "tired":
            form_context += ("\nSELF-REPORT: zverenec sa cíti unavený — zváž mierne zmäkčenie "
                             "(pomalší okraj tempa, menej opakovaní/kratší objem).")

        proposal = workout_generator.update_next_workout(client, profile, form_context)

        # Deterministická poistka: pri OSTREJ bolesti vždy ľahký beh (nezávisle od LLM)
        if sharp_pain and proposal.get("status") == "success" and proposal.get("proposed_workout"):
            paces = hansons_knowledge.compute_training_paces(profile.get("target_time", "")) or {}
            easy_step = {"type": "run", "distance_km": 6.0}
            if paces.get("easy_min") and paces.get("easy_max"):
                easy_step["pace_min"] = paces["easy_max"]   # pomalší okraj
                easy_step["pace_max"] = paces["easy_min"]   # rýchlejší okraj
            proposal["proposed_workout"] = {
                "workout_name": "Easy regeneračný beh 6 km (kvôli bolesti)",
                "description": ("Hlásil si ostrú bolesť — namiesto tvrdého tréningu len ľahký beh. "
                                "Ak bolesť pretrváva alebo sa zhoršuje, vynechaj beh a oddýchni si."),
                "steps": [easy_step],
            }
            proposal["coach_message"] = (
                "Hlásiš ostrú bolesť, preto som najbližší tréning zmenil na ľahký regeneračný beh "
                "(pokojne si daj radšej úplné voľno) — zdravie je prednosť. "
                + (proposal.get("coach_message") or "")
            ).strip()
        # Doplň kroky pôvodného tréningu pre porovnanie v UI
        old_id = proposal.get("old_workout_id")
        if old_id:
            try:
                old_details = client.get_workout_by_id(old_id)
                rows, _ = _flatten_workout_steps(
                    (old_details.get("workoutSegments") or [{}])[0].get("workoutSteps")
                )
                proposal["original_steps"] = rows
            except Exception:
                proposal["original_steps"] = []
        return proposal
    except Exception as e:
        raise _server_error(e, "Nepodarilo sa prepočítať tréning.")


class WorkoutConfirmRequest(BaseModel):
    # Garmin workoutId chodí ako číslo → bez koercie by Pydantic v2 vrátil 422
    # (a klient by zobrazil "[object Object]"). Povolíme aj numerické ID.
    model_config = ConfigDict(coerce_numbers_to_str=True)
    workout: dict
    old_workout_id: str
    target_date_str: str

@app.post("/api/plan/daily_update/confirm")
def confirm_daily_update(req: WorkoutConfirmRequest, client=Depends(get_garmin_client)):
    """Uloží potvrdený AI tréning do Garminu a zmaže starý."""
    try:
        new_w_data = req.workout
        old_workout_id = req.old_workout_id
        target_date_str = req.target_date_str

        steps_json = new_w_data.get("steps", [])
        garmin_steps = workout_generator.build_garmin_steps(steps_json)   # podporuje repeat-bloky
        _, est_dur = workout_generator._estimate_steps(steps_json)

        segment = workout_generator.WorkoutSegment(
            segmentOrder=1,
            sportType={"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1},
            workoutSteps=garmin_steps,
        )
        gw = workout_generator.RunningWorkout(
            workoutName=new_w_data.get("workout_name", "Updated Workout"),
            description=new_w_data.get("description", ""),
            estimatedDurationInSecs=int(est_dur),
            workoutSegments=[segment],
        )

        resp = client.upload_running_workout(gw)
        new_id = resp.get("workoutId")
        if new_id:
            client.schedule_workout(new_id, target_date_str)
            if old_workout_id:
                try:
                    client.delete_workout(old_workout_id)
                except Exception:
                    pass
            return {"status": "success", "message": "Tréning bol úspešne uložený do Garminu."}
        else:
            raise HTTPException(status_code=500, detail="Garmin nevrátil ID nového tréningu.")
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "Nepodarilo sa uložiť tréning do Garminu.")


# ── Reports ───────────────────────────────────────────────────────────────────

def _goal_pace_sec_per_km(target_time) -> Optional[int]:
    """Cieľové tempo (s/km) z cieľového času na polmaratón (21.0975 km)."""
    try:
        parts = [int(x) for x in str(target_time).split(":")]
        if len(parts) == 3:
            total = parts[0] * 3600 + parts[1] * 60 + parts[2]
        elif len(parts) == 2:
            total = parts[0] * 60 + parts[1]
        else:
            return None
        return round(total / 21.0975) if total > 0 else None
    except Exception:
        return None


@app.get("/api/reports/weekly")
def get_weekly_report(
    refresh: bool = False,
    user_id: str = Depends(get_current_user),
    client=Depends(get_garmin_client),
):
    """
    Reports pre Hansonovu metódu:
    - Regenerácia za 7 dní: spánok, HRV, Body Battery (zvládanie kumulovanej únavy)
    - Behy za posledných 7 dní (tempo/HR/kadencia) + cieľové tempo ako referencia
    - Týždenný objem (km/týždeň) cez celý cyklus prípravy — kľúčová Hanson metrika
    ?refresh=true obíde denný cache a stiahne čerstvé dáta z Garminu.
    """
    try:
        today = datetime.date.today()
        profile = get_user_profile(user_id) or {}
        try:
            start = datetime.date.fromisoformat(str(profile.get("training_start_date"))[:10])
        except Exception:
            start = today - datetime.timedelta(days=126)
        # Okno pre objemový graf: od začiatku prípravy, max ~12 týždňov (čitateľnosť + API limit)
        report_days = min(max(14, (today - start).days + 1), 84)

        snap = _wellness_snapshot(client, user_id, force=refresh)
        activities = fetcher.get_recent_activities(client, days=report_days) or []
        sleep_data = snap["sleep"]
        hrv_data = snap["hrv"]
        bb_data = snap["body_battery"]
        training_load = snap["training_load"]

        running_types = ("running", "track_running", "treadmill_running", "trail_running")
        running = [
            a for a in activities
            if (a.get("activityType", {}).get("typeKey") or "").lower() in running_types
        ]

        # Posledné behy (7 dní) pre zoznam + tempo trend
        seven_ago = (today - datetime.timedelta(days=7)).isoformat()
        runs = []
        for act in running:
            d = (act.get("startTimeLocal") or "")[:10]
            if d < seven_ago:
                continue
            avg_speed = act.get("averageSpeed")
            avg_pace_sec = round(1000 / avg_speed) if avg_speed else None
            runs.append({
                "date": d,
                "name": act.get("activityName", "Beh"),
                "distance_km": round((act.get("distance") or 0) / 1000, 2),
                "avg_pace_sec": avg_pace_sec,
                "avg_pace_str": (f"{avg_pace_sec // 60}:{avg_pace_sec % 60:02d}" if avg_pace_sec else None),
                "avg_hr": round(act["averageHR"]) if act.get("averageHR") else None,
                "avg_cadence": round(cad) if (cad := (act.get("averageRunningCadenceInStepsPerMinute") or act.get("averageCadence"))) else None,
                "calories": round(act["calories"]) if act.get("calories") else None,
            })

        total_km = round(sum(r["distance_km"] for r in runs), 1)

        # Týždenný objem (Po–Ne) cez celý cyklus
        buckets: Dict[datetime.date, float] = {}
        for act in running:
            d = (act.get("startTimeLocal") or "")[:10]
            try:
                ad = datetime.date.fromisoformat(d)
            except Exception:
                continue
            ws = ad - datetime.timedelta(days=ad.weekday())  # pondelok daného týždňa
            buckets[ws] = buckets.get(ws, 0.0) + (act.get("distance") or 0) / 1000

        cur_ws = today - datetime.timedelta(days=today.weekday())
        n_weeks = min(12, max(1, report_days // 7))
        weekly_volume = []
        for i in range(n_weeks - 1, -1, -1):
            ws = cur_ws - datetime.timedelta(weeks=i)
            weekly_volume.append({"week": ws.strftime("%d.%m."), "km": round(buckets.get(ws, 0.0), 1)})

        avg_sleep = (
            round(sum(s.get("duration_hours") or 0 for s in sleep_data) / len(sleep_data), 1)
            if sleep_data else None
        )

        bb_daily = []
        if bb_data.get("raw"):
            for entry in bb_data["raw"]:
                bb_daily.append({"date": entry.get("date", ""), "charged": entry.get("charged")})

        return {
            "period_days": 7,
            "total_km": total_km,
            "avg_sleep_hours": avg_sleep,
            "runs": runs,
            "weekly_volume": weekly_volume,
            "goal_pace_sec": _goal_pace_sec_per_km(profile.get("target_time")),
            "training_load": training_load,
            "metric_trends": get_metric_history(user_id, days=90),
            "sleep": sleep_data,
            "hrv": hrv_data,
            "body_battery": {
                "today": bb_data.get("today_charged"),
                "weekly_avg": bb_data.get("weekly_avg"),
                "daily": bb_daily,
            },
        }
    except Exception as e:
        raise _server_error(e, "Nepodarilo sa načítať report.")


@app.get("/api/debug/hrv")
def debug_hrv_raw(user_id: str = Depends(get_current_user), client=Depends(get_garmin_client)):
    """Debug endpoint — vráti surovú štruktúru HRV odpovede z Garmin API za posledné 3 dni.
    Pomáha diagnostikovať mapovanie polí (lastNight, hrvReadings atď.)."""
    from datetime import date, timedelta
    result = {}
    for i in range(3):
        d = (date.today() - timedelta(days=i)).isoformat()
        try:
            raw = fetcher._garmin_call(client.get_hrv_data, d)
            summary = (raw or {}).get("hrvSummary") or {}
            readings = (raw or {}).get("hrvReadings") or []
            result[d] = {
                "summary_keys": list(summary.keys()) if summary else [],
                "summary": summary,
                "readings_count": len(readings) if isinstance(readings, list) else type(readings).__name__,
                "readings_sample": readings[:2] if isinstance(readings, list) else readings,
            }
        except Exception as e:
            result[d] = {"error": str(e)}
    return result


# ── Chat ──────────────────────────────────────────────────────────────────────

@app.post("/api/chat")
def chat_with_coach(
    req: ChatRequest,
    user_id: str = Depends(get_current_user),
    client=Depends(get_garmin_client),
):
    """AI tréner s výberom modelu (flash/pro) a plným Garmin kontextom."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY nie je nastavený")

    profile = get_user_profile(user_id) or {}
    target_time = profile.get("target_time", "neuvedený")
    training_week = _calculate_training_week(profile)
    ai_context = profile.get("ai_context", "")
    memory_facts = get_memory_facts(user_id)
    memory_block = "\n".join(f"- {f.get('content', '')}" for f in memory_facts) or "(zatiaľ žiadne)"

    # Model selection
    model_name = GEMINI_MODELS.get(req.model, GEMINI_MODELS["flash"])

    # Načítaj Garmin kontext
    garmin_context = ""
    try:
        # Wellness dáta z denného cache (šetrí ~10 Garmin volaní na každú správu).
        snap = _wellness_snapshot(client, user_id)
        activities = fetcher.get_recent_activities(client, days=14)  # čerstvé (odráža nové behy)
        sleep_data = snap["sleep"]
        hrv = snap["hrv"]
        bb = snap["body_battery"]
        readiness = snap["readiness"]
        stats = snap["stats"]
        training_load = snap["training_load"]
        lthr_data = snap["lthr"]
        athlete = snap["athlete"]
        resting_hr = stats.get("resting_hr")
        hr_zones = snap["hr_zones"]
        max_hr = snap["max_hr"]

        runs_summary = []
        for a in (activities or [])[:7]:
            d_km = round((a.get("distance") or 0) / 1000, 1)
            avg_speed = a.get("averageSpeed")
            pace_sec = round(1000 / avg_speed) if avg_speed else None
            pace_str = f"{pace_sec // 60}:{pace_sec % 60:02d}/km" if pace_sec else "N/A"
            act_name = a.get("activityName") or "Beh"
            act_id = a.get("activityId", "")
            runs_summary.append(
                f"  - {(a.get('startTimeLocal') or '')[:10]} [{act_name}] (ID:{act_id}): "
                f"{d_km}km @ {pace_str}, HR {a.get('averageHR', '?')}bpm, "
                f"kadencia {a.get('averageRunningCadenceInStepsPerMinute', '?')} spm"
            )

        next_w_str = "Žiadny naplánovaný tréning."
        try:
            now = datetime.datetime.now()
            if getattr(req, "local_time", None):
                try:
                    now = datetime.datetime.strptime(req.local_time, "%Y-%m-%d %H:%M")
                except:
                    pass

            today = now.date()
            today_str = now.strftime("%Y-%m-%d")
            items = _get_scheduled_range(client, today, today + datetime.timedelta(days=45))
            upcoming = sorted(
                [i for i in items if _is_planned_workout(i) and (i.get("date") or "") >= today_str],
                key=lambda x: x.get("date"),
            )
            if upcoming:
                nw = upcoming[0]
                next_w_str = f"{nw.get('date')} – {nw.get('title') or 'Beh'}"
        except Exception:
            pass

        first_sleep = sleep_data[0] if sleep_data else {}
        sleep_summary = ", ".join(
            f"{s.get('date','?')}: {s.get('duration_hours','?')}h skóre {s.get('score','?')}"
            for s in (sleep_data or [])[:5]
        )

        # HR zóny — jednotné formátovanie (reálne Garmin zóny ak sú)
        zones_str = hansons_knowledge.hr_zones_block(
            hr_zones, lthr_data.get("lthr_pace") or athlete.get("lthr_pace")
        ).strip() or "N/A"

        athlete_line = (
            f"Vek: {athlete.get('age', 'N/A')} | Pohlavie: {athlete.get('gender', 'N/A')} | "
            f"Výška: {athlete.get('height_cm', 'N/A')} cm | Váha: {athlete.get('weight_kg', 'N/A')} kg | "
            f"VO2max: {athlete.get('vo2max', 'N/A')}"
        )
        garmin_context = f"""
--- GARMIN DÁTA ---
Týždeň prípravy: {training_week}/18
Športovec: {athlete_line}
Body Battery: {bb.get('today_charged', 'N/A')}/100
HRV: {hrv.get('status', 'N/A')} (last night: {hrv.get('last_night', 'N/A')} ms, weekly avg: {hrv.get('weekly_avg', 'N/A')} ms)
Pokojový tep: {resting_hr or 'N/A'} bpm | Max HR (z histórie): {max_hr or 'N/A'} bpm
LTHR: {lthr_data.get('lthr') or athlete.get('lthr', 'N/A')} bpm | LT tempo: {lthr_data.get('lthr_pace') or athlete.get('lthr_pace', 'N/A')}
Pripravenosť: {readiness.get('score', 'N/A')}/100 ({readiness.get('level', '')})
Training Load: akútna {training_load.get('acute_load', 'N/A')} | chronická {training_load.get('chronic_load', 'N/A')} | ratio {training_load.get('ratio', 'N/A')} | status: {training_load.get('status', 'N/A')}
Spánok (posl. 5 dní): {sleep_summary or 'N/A'}
{zones_str}
{hansons_knowledge.paces_block(target_time, athlete.get('vo2max'))}
Posledné behy (14 dní):
{chr(10).join(runs_summary) if runs_summary else 'Žiadne aktivity.'}

Najbližší tréning: {next_w_str}
{hansons_knowledge.training_load_block(training_load)}{hansons_knowledge.phase_block(training_week)}
--- KONIEC ---"""
    except Exception as e:
        garmin_context = f"(Garmin dáta sa nepodarilo načítať: {e})"

    if getattr(req, "local_time", None):
        today_full = req.local_time
    else:
        today_full = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        
    system_instruction = (
        f"Si osobný AI bežecký tréner — špičkový expert na Hansons Half-Marathon Advanced metódu. "
        f"Tvoje rady musia vychádzať z metodiky NIŽŠIE a z REÁLNYCH Garmin dát zverenca (vek, váha, "
        f"VO2max, LTHR, HR zóny, tempá, history). Nehovor všeobecne — argumentuj konkrétnymi číslami. "
        f"Dnešný dátum a čas: {today_full}. "
        f"Cieľový čas: {target_time}. Aktuálny týždeň prípravy: {training_week}/18. "
        f"VŽDY hovor po slovensky. Buď konkrétny, vecný a povzbudivý. "
        f"Odpovede prispôsob mobilnej aplikácii – stručne, ale neobetuj odbornosť. "
        f"Pri analýze tréningu/intervalov si vyžiadaj detaily nástrojom get_activity_laps. "
        f"Easy a dlhé behy VŽDY odporúčaj podľa TEPU (Easy HR zóna), nie podľa tempa — vysvetli prečo. "
        f"REORGANIZÁCIA TÝŽDŇA: keď používateľ nemôže absolvovať tréning v daný deň a chce upraviť plán, "
        f"NAJPRV si zavolaj list_garmin_workouts a pozri si CELÝ týždeň. Potom navrhni presun podľa Hanson pravidiel "
        f"(nikdy 2 SOS tréningy za sebou — medzi Speed/Tempo/Long musí byť Easy deň; dlhý beh nechaj na víkend). "
        f"Presúvaj cez reschedule_workout (naozaj presunie, nezduplikuje). Ak dva tréningy kolidujú v jeden deň, "
        f"presuň oba — najprv uvoľni cieľový deň. Dbaj, aby v jeden deň neostali dva tréningy. "
        f"Pri väčšej zmene rozpíš používateľovi finálny rozvrh (deň → tréning) a až potom vykonaj presuny. "
        f"Nikdy sa NEPÝTAJ na veci, ktoré vieš z Garmin dát. "
        f"Keď sa zverenec pýta na priebeh/plnenie týždňa alebo chce upraviť plán, zavolaj "
        f"check_recent_compliance; ak našlo vynechané SOS tréningy, aktívne navrhni ich presun "
        f"(nikdy 2 SOS za sebou). "
        f"ČO O ZVERENCOVI VIEŠ (pamäť trénera):\n{memory_block}\n"
        f"Doplnkové voľné poznámky: {ai_context}\n"
        f"{workout_generator.training_timeline_note(profile)}"
        f"DÔLEŽITÁ INŠTRUKCIA K PAMÄTI: Ak ti používateľ napíše nejakú novú podstatnú informáciu (zranenie, zmena vybavenia, preferencie), "
        f"začni svoju odpoveď tagom <MEMORY>tu zapíš nový fakt</MEMORY>. "
        f"Príklad: <MEMORY>Bolí ho koleno, stredy chce mať voľné</MEMORY> Dávaj si na to koleno pozor...\n"
        f"\n{hansons_knowledge.HANSONS_METHODOLOGY}\n"
        f"\n{garmin_context}"
    )

    # Definícia funkcií (nástrojov) pre model
    def get_hr_zones() -> str:
        """Vráti aktuálne vypočítané HR tréningové zóny pre Hanson metódu (Easy, Tempo, Speed, atď.)
        na základe LTHR alebo Max HR z Garmin účtu."""
        if not hr_zones:
            return "HR zóny nie sú k dispozícii — Garmin nevrátil nakonfigurované zóny ani LTHR/MaxHR."
        block = hansons_knowledge.hr_zones_block(
            hr_zones, lthr_data.get("lthr_pace") or athlete.get("lthr_pace")
        ).strip()
        return (
            block + "\n\n"
            f"Easy behy: drž sa Easy pásma ({hr_zones['easy'][0]}–{hr_zones['easy'][1]} bpm) — podľa TEPU, nie tempa."
        )

    def get_activity_laps(date: str) -> str:
        """Načíta podrobné lap/split dáta pre aktivitu na daný dátum (YYYY-MM-DD alebo 'yesterday'/'dnes').
        Vracia tempo, HR a kadencia pre každý úsek/lap — nevyhnutné pri analýze intervalových tréningov."""
        try:
            # Preložiť aliasy
            today = datetime.date.today()
            if date.lower() in ("yesterday", "vcera", "včera"):
                target_date = (today - datetime.timedelta(days=1)).isoformat()
            elif date.lower() in ("today", "dnes"):
                target_date = today.isoformat()
            else:
                target_date = date[:10]

            # Nájdi aktivitu na daný dátum
            acts = fetcher.get_recent_activities(client, days=14) or []
            matching = [
                a for a in acts
                if (a.get("startTimeLocal") or "")[:10] == target_date
            ]
            if not matching:
                return f"Žiadna aktivita na dátum {target_date} nebola nájdená."

            act = matching[0]
            act_id = act.get("activityId")
            act_name = act.get("activityName", "Beh")
            d_km = round((act.get("distance") or 0) / 1000, 2)
            avg_speed = act.get("averageSpeed")
            avg_pace_sec = round(1000 / avg_speed) if avg_speed else None
            avg_pace_str = f"{avg_pace_sec // 60}:{avg_pace_sec % 60:02d}/km" if avg_pace_sec else "N/A"

            result = (
                f"Aktivita: {act_name} ({target_date})\n"
                f"Celková vzdialenosť: {d_km} km, priemerné tempo: {avg_pace_str}, "
                f"avg HR: {round(act.get('averageHR') or 0)} bpm, "
                f"avg kadencia: {round(act.get('averageRunningCadenceInStepsPerMinute') or 0)} spm\n\n"
            )

            # Načítaj splits
            try:
                splits_data = client.get_activity_splits(act_id)
                laps = []
                if isinstance(splits_data, dict):
                    laps = splits_data.get("lapDTOs") or splits_data.get("splits") or []
                elif isinstance(splits_data, list):
                    laps = splits_data

                if laps:
                    result += f"Lapy ({len(laps)}):\n"
                    for i, lap in enumerate(laps, 1):
                        lap_dist_m = lap.get("distance") or 0
                        lap_dist_km = round(lap_dist_m / 1000, 3)
                        lap_speed = lap.get("averageSpeed")
                        lap_pace_sec = round(1000 / lap_speed) if lap_speed else None
                        lap_pace_str = f"{lap_pace_sec // 60}:{lap_pace_sec % 60:02d}/km" if lap_pace_sec else "N/A"
                        lap_hr = round(lap.get("averageHR") or 0) or "N/A"
                        lap_max_hr = round(lap.get("maxHR") or 0) or "N/A"
                        lap_cad = round(lap.get("averageRunningCadenceInStepsPerMinute") or lap.get("averageCadence") or 0) or "N/A"
                        lap_dur_sec = lap.get("duration") or 0
                        dur_str = f"{int(lap_dur_sec // 60)}:{int(lap_dur_sec % 60):02d}" if lap_dur_sec else "N/A"
                        result += (
                            f"  Lap {i}: {lap_dist_km}km | {lap_pace_str} | "
                            f"HR {lap_hr}/{lap_max_hr} bpm | kadencia {lap_cad} spm | čas {dur_str}\n"
                        )
                else:
                    result += "(Lap dáta nie sú dostupné pre túto aktivitu.)"
            except Exception as e:
                result += f"(Chyba pri načítaní lapov: {str(e)})"

            return result.strip()
        except Exception as e:
            return f"Chyba pri načítaní aktivity: {str(e)}"

    def list_garmin_workouts(days_ahead: int = 14) -> str:
        """Zobrazí zoznam naplánovaných tréningov na najbližších N dní (1-45 dní). Vráti formátovaný zoznam."""
        try:
            today = datetime.date.today()
            end = today + datetime.timedelta(days=min(days_ahead, 45))
            items = _get_scheduled_range(client, today, end)
            planned = [i for i in items if _is_planned_workout(i)]
            if not planned:
                return "Žiadne naplánované tréningy v tomto období."
            result = "Naplánované tréningy:\n"
            for item in sorted(planned, key=lambda x: x.get("date", "")):
                d = item.get("date", "?")[:10]
                title = item.get("title") or item.get("workoutName") or "Beh"
                workout_id = item.get("workoutId", "?")
                result += f"  • {d}: {title} (ID: {workout_id})\n"
            return result.strip()
        except Exception as e:
            return f"Chyba pri čítaní tréningov: {str(e)}"

    def get_workout_details(workout_id: str) -> str:
        """Zobrazí detailné informácie o konkrétnom tréningu vrátane krokov a cieľov."""
        try:
            if not hasattr(client, 'get_workout_by_id'):
                return "Detaily tréningu nie sú dostupné."
            details = client.get_workout_by_id(workout_id)
            if not details:
                return f"Tréning ID {workout_id} nebol nájdený."

            workout_name = details.get("workoutName", "Beh")
            description = details.get("description") or ""

            steps_summary = []
            for seg in details.get("workoutSegments") or []:
                rows, _ = _flatten_workout_steps(seg.get("workoutSteps"))
                steps_summary.extend(rows)

            result = f"Tréning: {workout_name}\n"
            if description:
                result += f"Popis: {description}\n"
            if steps_summary:
                result += "Kroky:\n"
                for i, step in enumerate(steps_summary, 1):
                    dist_str = f"{step.get('distance_km')} km" if step.get('distance_km') else ""
                    dur_str = f"{step.get('duration_min')} min" if step.get('duration_min') else ""
                    target_str = f" ({step.get('target')})" if step.get('target') else ""
                    result += f"  {i}. {step.get('type')}: {dist_str or dur_str}{target_str}\n"
            return result.strip()
        except Exception as e:
            return f"Chyba pri čítaní detailov: {str(e)}"

    def reschedule_workout(workout_id: str, new_date: str) -> str:
        """Presunie existujúci tréning na nový dátum (YYYY-MM-DD). Tréning identifikuj cez
        workout_id (z list_garmin_workouts). Funkcia naozaj PRESUNIE — najprv zruší pôvodný
        záznam v kalendári a potom naplánuje na nový dátum (nezostane duplikát na starom dni)."""
        try:
            today = datetime.date.today()
            # Nájdi všetky kalendárové výskyty tohto workoutId (3 mesiace dopredu/mesiac dozadu)
            items = _get_scheduled_range(
                client, today - datetime.timedelta(days=31), today + datetime.timedelta(days=90)
            )
            occurrences = [
                it for it in items
                if str(it.get("workoutId")) == str(workout_id) and it.get("id")
            ]
            # Zruš pôvodné naplánovania (schedule id = 'id'), aby nevznikol duplikát
            unscheduled = 0
            for occ in occurrences:
                try:
                    client.unschedule_workout(occ["id"])
                    unscheduled += 1
                except Exception:
                    pass
            # Naplánuj na nový dátum
            client.schedule_workout(workout_id, new_date)
            note = "" if unscheduled else " (pôvodný termín sa nenašiel — vytvoril sa nový záznam)"
            return f"Tréning {workout_id} presunutý na {new_date}{note}."
        except Exception as e:
            return f"Chyba pri presune tréningu: {str(e)}"

    def delete_garmin_workout(date: str) -> str:
        """Vymaže všetky tréningy naplánované na daný dátum v Garmin kalendári. Format: YYYY-MM-DD."""
        try:
            d = datetime.datetime.strptime(date, "%Y-%m-%d")
            scheduled = client.get_scheduled_workouts(d.year, d.month)
            items = scheduled.get("calendarItems", scheduled.get("workoutScheduledDTOList", [])) if isinstance(scheduled, dict) else scheduled or []
            deleted = 0
            for item in items:
                if item.get("date") == date:
                    w_id = item.get("workoutId")
                    if w_id:
                        client.delete_workout(w_id)
                        deleted += 1
            return f"Úspešne vymazané {deleted} tréning(ov) pre dátum {date}." if deleted > 0 else f"Na dátum {date} nebol nájdený žiadny tréning."
        except Exception as e:
            return f"Chyba pri mazaní: {str(e)}"

    def _build_and_schedule(workout_data: dict, date: str) -> Optional[str]:
        """Z AI JSON postaví Garmin tréning, nahrá ho a naplánuje na dátum. Vráti workoutId."""
        steps_json = workout_data.get("steps", [])
        garmin_steps = workout_generator.build_garmin_steps(steps_json)   # podporuje repeat-bloky
        _, est_dur = workout_generator._estimate_steps(steps_json)
        segment = workout_generator.WorkoutSegment(
            segmentOrder=1,
            sportType={"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1},
            workoutSteps=garmin_steps,
        )
        garmin_workout = workout_generator.RunningWorkout(
            workoutName=workout_data.get("workout_name", "Beh"),
            description=workout_data.get("description", ""),
            estimatedDurationInSecs=int(est_dur),
            workoutSegments=[segment],
        )
        resp = client.upload_running_workout(garmin_workout)
        new_id = resp.get("workoutId")
        if new_id:
            client.schedule_workout(new_id, date)
        return new_id

    def _remove_workout_by_id(workout_id) -> bool:
        """Zruší všetky kalendárové výskyty daného tréningu a vymaže šablónu. Presné mazanie."""
        try:
            today = datetime.date.today()
            items = _get_scheduled_range(
                client, today - datetime.timedelta(days=31), today + datetime.timedelta(days=90)
            )
            for occ in items:
                if str(occ.get("workoutId")) == str(workout_id) and occ.get("id"):
                    try:
                        client.unschedule_workout(occ["id"])
                    except Exception:
                        pass
            client.delete_workout(workout_id)
            return True
        except Exception:
            return False

    def create_and_schedule_workout(date: str, description: str) -> str:
        """Vygeneruje NOVÝ tréning podľa požiadavky (Hanson metodika + tvoje Garmin dáta/zóny)
        a naplánuje ho na daný dátum (YYYY-MM-DD). Všetko TEMPOM; intervaly ako repeat-blok."""
        try:
            datetime.datetime.strptime(date, "%Y-%m-%d")  # validácia
            profile = get_user_profile(user_id) or {}
            workout_data = workout_generator.generate_single_workout(profile, description, client, date)
            new_id = _build_and_schedule(workout_data, date)
            if new_id:
                return f"✓ Nový tréning '{workout_data.get('workout_name')}' naplánovaný na {date}."
            return "Chyba: Garmin nevrátil ID nového tréningu."
        except json.JSONDecodeError:
            return "Chyba: AI nevygenerovala platný JSON."
        except Exception as e:
            return f"Chyba pri vytváraní tréningu: {str(e)}"

    def modify_workout(workout_id: str, date: str, change_request: str) -> str:
        """Uprav/zmeň existujúci naplánovaný tréning (napr. 'sprav ho kratší 6km', 'zmäkči na easy',
        'pridaj rozcvičku'). workout_id z list_garmin_workouts, date = jeho dátum (YYYY-MM-DD).
        Vytvorí upravenú verziu na ten istý deň a starý tréning odstráni (žiadny duplikát)."""
        try:
            datetime.datetime.strptime(date, "%Y-%m-%d")  # validácia
            profile = get_user_profile(user_id) or {}
            # Doplň kontext pôvodného tréningu, ak sa dá
            try:
                old = client.get_workout_by_id(workout_id)
                old_name = old.get("workoutName", "") if isinstance(old, dict) else ""
            except Exception:
                old_name = ""
            desc = f"Uprav existujúci tréning '{old_name}' podľa: {change_request}"
            workout_data = workout_generator.generate_single_workout(profile, desc, client, date)
            new_id = _build_and_schedule(workout_data, date)
            if not new_id:
                return "Chyba: Garmin nevrátil ID upraveného tréningu."
            _remove_workout_by_id(workout_id)  # odstráň pôvodný
            return f"✓ Tréning upravený: '{workout_data.get('workout_name')}' na {date}."
        except json.JSONDecodeError:
            return "Chyba: AI nevygenerovala platný JSON."
        except Exception as e:
            return f"Chyba pri úprave tréningu: {str(e)}"

    def update_training_goal(target_time: str = "", race_date: str = "") -> str:
        """Aktualizuje tréningový cieľ: cieľový čas na polmaratón (napr. '1:45:00') a/alebo
        dátum pretekov (YYYY-MM-DD). Zmení sa profil → prepočítajú sa tempá aj fáza prípravy."""
        try:
            updates = {}
            if target_time:
                updates["target_time"] = target_time
            if race_date:
                datetime.datetime.strptime(race_date, "%Y-%m-%d")  # validácia
                updates["race_date"] = race_date
            if not updates:
                return "Nezadal si nový cieľ ani dátum pretekov."
            update_user_profile(user_id, updates)
            parts = []
            if "target_time" in updates: parts.append(f"cieľ {updates['target_time']}")
            if "race_date" in updates: parts.append(f"preteky {updates['race_date']}")
            return f"✓ Aktualizované: {', '.join(parts)}. Tempá a fáza prípravy sa prepočítajú."
        except Exception as e:
            return f"Chyba pri úprave cieľa: {str(e)}"

    def check_recent_compliance(days_back: int = 10) -> str:
        """Skontroluje za posledných N dní (1–21), ktoré naplánované tréningy zverenec splnil a
        ktoré vynechal — zvlášť upozorní na vynechané KĽÚČOVÉ (SOS) tréningy (Speed/Strength/
        Tempo/Dlhý beh). Použi, keď sa zverenec pýta na priebeh týždňa, plnenie plánu alebo chce
        upraviť plán — vieš tak navrhnúť presun vynechaných SOS podľa Hanson pravidiel."""
        try:
            n = min(max(int(days_back or 10), 1), 21)
            today = datetime.date.today()
            start = today - datetime.timedelta(days=n)
            today_str = today.strftime("%Y-%m-%d")
            start_str = start.strftime("%Y-%m-%d")
            items = _get_scheduled_range(client, start, today)
            planned = [
                i for i in items
                if _is_planned_workout(i) and start_str <= (i.get("date") or "")[:10] < today_str
            ]
            if not planned:
                return f"Za posledných {n} dní nie sú v minulosti žiadne naplánované tréningy."
            running_types = ("running", "track_running", "treadmill_running", "trail_running")
            acts = fetcher.get_recent_activities(client, days=n + 1) or []
            done_dates = {
                (a.get("startTimeLocal") or "")[:10] for a in acts
                if (a.get("activityType", {}).get("typeKey") or "").lower() in running_types
            }
            lines, missed_sos = [], 0
            for it in sorted(planned, key=lambda x: x.get("date", "")):
                d = (it.get("date") or "")[:10]
                title = it.get("title") or it.get("workoutName") or "Beh"
                done = d in done_dates or bool(it.get("activityId"))
                sos = _is_sos_title(title)
                if not done and sos:
                    missed_sos += 1
                status = "✅ splnené" if done else ("❌ VYNECHANÉ — SOS!" if sos else "❌ vynechané")
                lines.append(f"  • {d}: {title} — {status}")
            head = (f"Vynechané SOS tréningy: {missed_sos} — navrhni presun podľa Hanson pravidiel.\n"
                    if missed_sos else "Žiadne vynechané SOS tréningy 👍\n")
            return head + "Posledné naplánované tréningy:\n" + "\n".join(lines)
        except Exception as e:
            return f"Chyba pri kontrole plnenia: {str(e)}"

    try:
        # Nástroje = obyčajné Python funkcie (definované vyššie). Nová google-genai SDK
        # z nich sama vyrobí schému a cez automatické volanie funkcií (AFC) spustí celú
        # slučku volaní, kým model nedá finálnu textovú odpoveď.
        tools = [get_hr_zones, get_activity_laps, list_garmin_workouts, get_workout_details,
                 reschedule_workout, delete_garmin_workout, create_and_schedule_workout,
                 modify_workout, update_training_goal, check_recent_compliance]

        # História chatu → google-genai formát (role: user/model). Gemini musí začať
        # userom, preto zahodíme úvodný pozdrav (model) na začiatku.
        contents = []
        for msg in req.history:
            text = (msg.get("content") or "").strip()
            if not text:
                continue
            role = "user" if msg.get("role") == "user" else "model"
            contents.append(types.Content(role=role, parts=[types.Part(text=text)]))
        while contents and contents[0].role != "user":
            contents.pop(0)
        contents.append(types.Content(role="user", parts=[types.Part(text=req.message)]))

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            tools=tools,
            # AFC slučka — dosť krokov na reorganizáciu celého týždňa (viac presunov)
            automatic_function_calling=types.AutomaticFunctionCallingConfig(maximum_remote_calls=10),
        )
        try:
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config,
            )
            response_text = (response.text or "").strip()
        except Exception:
            # Graceful fallback (200, nie 500), keď Gemini zlyhá/limit — frontend ukáže správu.
            logger.exception("Gemini chat zlyhal")
            return {
                "response": "Prepáč, AI tréner je teraz chvíľu nedostupný 😴. Skús o chvíľu znova — "
                            "medzitým sa drž svojho naplánovaného tréningu.",
                "model_used": model_name,
            }

        if not response_text:
            response_text = "Prepáč, túto požiadavku som teraz nezvládol spracovať. Skús ju preformulovať. 🏃"
        
        # Spracovanie pamäte — nové fakty ukladáme štruktúrovane (tabuľka athlete_memory)
        import re
        match = re.search(r'<MEMORY>(.*?)</MEMORY>', response_text, re.IGNORECASE | re.DOTALL)
        if match:
            new_fact = match.group(1).strip()
            # deduplikácia proti existujúcim faktom aj starým voľným poznámkam
            existing = (
                " ".join((f.get("content") or "") for f in memory_facts).lower()
                + " " + (profile.get("ai_context") or "").lower()
            )
            if new_fact and new_fact.lower() not in existing:
                add_memory_fact(user_id, new_fact, "note")
            # Odstránenie tagu z odpovede
            response_text = re.sub(r'<MEMORY>.*?</MEMORY>', '', response_text, flags=re.IGNORECASE | re.DOTALL).strip()
            
        return {"response": response_text, "model_used": model_name}
    except Exception as e:
        raise _server_error(e, "Tréner teraz nie je dostupný. Skús to o chvíľu.")


# ── Debug ─────────────────────────────────────────────────────────────────────

@app.get("/api/debug/raw")
def debug_raw(client=Depends(get_garmin_client)):
    now = datetime.datetime.now()
    try:
        scheduled_raw = client.get_scheduled_workouts(now.year, now.month)
        activities_raw = client.get_activities(0, 5)
        return {"scheduled_raw": scheduled_raw, "activities_raw": activities_raw}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
