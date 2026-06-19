from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
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
from modules.database import verify_token, get_user_profile, update_user_profile, encrypt_password
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
    """Vypočíta aktuálny týždeň prípravy (1-18) z dátumu začiatku."""
    start_str = profile.get("training_start_date", "2026-06-01")
    try:
        start_date = datetime.date.fromisoformat(start_str)
        delta = (datetime.date.today() - start_date).days
        week = max(1, min(18, delta // 7 + 1))
        return week
    except Exception:
        return 1


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

        updated = update_user_profile(user_id, update_data)
        return {"status": "success", "profile": updated}
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(error_details)
        raise HTTPException(status_code=400, detail=str(e))


# ── Dashboard ────────────────────────────────────────────────────────────────

@app.get("/api/dashboard/today")
def get_dashboard_today(
    user_id: str = Depends(get_current_user),
    client=Depends(get_garmin_client),
):
    """Vráti dnešné dáta (Spánok, HRV, Body Battery, Pripravenosť) + posledné aktivity."""
    today = datetime.datetime.now().strftime("%Y-%m-%d")

    try:
        profile = get_user_profile(user_id) or {}
        training_week = _calculate_training_week(profile)

        sleep_data = fetcher.get_sleep_data(client, days=1)
        sleep = sleep_data[0] if sleep_data else {}
        hrv = fetcher.get_hrv_data(client) or {}
        stats = fetcher.get_stats_summary(client) or {}
        readiness = fetcher.get_training_readiness(client) or {}
        bb = fetcher.get_body_battery(client) or {}
        training_load = fetcher.get_training_load(client) or {}
        activities = fetcher.get_recent_activities(client, days=7)

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
        next_workout_str = "Dnes/Zajtra ťa nečaká žiadny špecifický tréning."
        try:
            today = datetime.date.today()
            today_str = today.strftime("%Y-%m-%d")
            items = _get_scheduled_range(client, today, today + datetime.timedelta(days=45))
            upcoming = sorted(
                [i for i in items if _is_planned_workout(i) and (i.get("date") or "") >= today_str],
                key=lambda x: x.get("date"),
            )
            if upcoming:
                nw = upcoming[0]
                next_workout_str = f"Najbližší tréning: {nw.get('date')} - {nw.get('title') or 'Beh'}"
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

        prompt = f"""Si bežecký tréner (Hansonova metóda). Zhodnoť dnešný stav zverenca a daj mu 2-3 krátke úderné vety.
Ak sú hodnoty slabé (Body Battery alebo Pripravenosť pod 50), odporúč mu nech si v sekcii Plán prepočíta tréning.
Ak sú hodnoty super, povzbuď ho. Používaj slovenčinu, buď povzbudivý, občas emoji.

Stav formy dnes: {form_score}/100
- Spánok skóre: {metrics.sleep_score}/100
- HRV: {metrics.hrv_status}
- Body Battery: {metrics.body_battery}/100
- Pripravenosť: {metrics.readiness}/100
{load_note}{next_workout_str}"""

        response = gemini_client.models.generate_content(
            model=GEMINI_MODELS["flash"],
            contents=prompt,
            config=types.GenerateContentConfig(max_output_tokens=400),
        )
        return {"advice": (response.text or "").strip()}
    except Exception:
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
        return plan_json
    except Exception as e:
        raise _server_error(e, "Nepodarilo sa vygenerovať plán. Skús to znova.")


class PlanUploadRequest(BaseModel):
    plan_data: dict

@app.post("/api/plan/upload")
def api_upload_plan(req: PlanUploadRequest, client=Depends(get_garmin_client)):
    try:
        garmin_workouts = workout_generator.convert_to_garmin_workouts(req.plan_data)
        uploaded = []
        for target_date, workout in garmin_workouts:
            resp = client.upload_running_workout(workout)
            workout_id = resp.get("workoutId")
            if workout_id:
                date_str = target_date.strftime("%Y-%m-%d")
                client.schedule_workout(workout_id, date_str)
                uploaded.append({"date": date_str, "name": workout.workoutName, "id": workout_id})
        return {"status": "success", "uploaded": uploaded}
    except Exception as e:
        raise _server_error(e, "Nepodarilo sa nahrať plán do Garminu.")


@app.get("/api/plan/daily_update")
def generate_daily_update(client=Depends(get_garmin_client), user_id: str = Depends(get_current_user)):
    """Generuje AI návrh na úpravu najbližšieho tréningu podľa LTHR."""
    try:
        profile = get_user_profile(user_id) or {}
        proposal = workout_generator.update_next_workout(client, profile)
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

        garmin_steps = []
        for i, s in enumerate(new_w_data.get("steps", [])):
            garmin_steps.append(workout_generator.create_garmin_step(s, i + 1))

        segment = workout_generator.WorkoutSegment(
            segmentOrder=1,
            sportType={"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1},
            workoutSteps=garmin_steps,
        )
        gw = workout_generator.RunningWorkout(
            workoutName=new_w_data.get("workout_name", "Updated Workout"),
            description=new_w_data.get("description", ""),
            estimatedDurationInSecs=0,
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
def get_weekly_report(user_id: str = Depends(get_current_user), client=Depends(get_garmin_client)):
    """
    Reports pre Hansonovu metódu:
    - Regenerácia za 7 dní: spánok, HRV, Body Battery (zvládanie kumulovanej únavy)
    - Behy za posledných 7 dní (tempo/HR/kadencia) + cieľové tempo ako referencia
    - Týždenný objem (km/týždeň) cez celý cyklus prípravy — kľúčová Hanson metrika
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

        activities = fetcher.get_recent_activities(client, days=report_days) or []
        sleep_data = fetcher.get_sleep_data(client, days=7) or []
        hrv_data = fetcher.get_hrv_data(client) or {}
        bb_data = fetcher.get_body_battery(client) or {}

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

    # Model selection
    model_name = GEMINI_MODELS.get(req.model, GEMINI_MODELS["flash"])

    # Načítaj Garmin kontext
    garmin_context = ""
    try:
        activities = fetcher.get_recent_activities(client, days=14)
        sleep_data = fetcher.get_sleep_data(client, days=7)
        hrv = fetcher.get_hrv_data(client) or {}
        bb = fetcher.get_body_battery(client) or {}
        readiness = fetcher.get_training_readiness(client) or {}
        stats = fetcher.get_stats_summary(client) or {}
        training_load = fetcher.get_training_load(client) or {}
        lthr_data = fetcher.get_lactate_threshold(client) or {}
        athlete = fetcher.get_athlete_profile(client) or {}
        resting_hr = stats.get("resting_hr")
        # Primárne reálne bežecké zóny z Garminu (RUNNING → DEFAULT → výpočet)
        hr_zones = fetcher.resolve_hr_zones(
            client,
            lthr=lthr_data.get("lthr") or athlete.get("lthr"),
            max_hr=fetcher.get_max_hr_from_activities(client, days=90),
            resting_hr=resting_hr,
        )
        # Max HR pre snapshot: preferuj nakonfigurovaný Garmin, inak z histórie
        max_hr = (hr_zones or {}).get("max_hr") or fetcher.get_max_hr_from_activities(client, days=90)

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
{hansons_knowledge.paces_block(target_time)}
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
        f"DODATOČNÉ POZNÁMKY O POUŽÍVATEĽOVI (ai_context): {ai_context}\n"
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
        garmin_steps = [
            workout_generator.create_garmin_step(step, i)
            for i, step in enumerate(workout_data.get("steps", []), 1)
        ]
        segment = workout_generator.WorkoutSegment(
            segmentOrder=1,
            sportType={"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1},
            workoutSteps=garmin_steps,
        )
        garmin_workout = workout_generator.RunningWorkout(
            workoutName=workout_data.get("workout_name", "Beh"),
            description=workout_data.get("description", ""),
            estimatedDurationInSecs=0,
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
        a naplánuje ho na daný dátum (YYYY-MM-DD). Easy/dlhé dostanú HR cieľ, tempo/intervaly tempo."""
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
        
        # Spracovanie pamäte
        import re
        match = re.search(r'<MEMORY>(.*?)</MEMORY>', response_text, re.IGNORECASE | re.DOTALL)
        if match:
            new_fact = match.group(1).strip()
            existing_context = profile.get('ai_context') or ''
            # deduplikácia alebo jednoduché pridanie
            if new_fact.lower() not in existing_context.lower():
                updated_context = existing_context + "\n- " + new_fact if existing_context else "- " + new_fact
                update_user_profile(user_id, {"ai_context": updated_context.strip()})
            
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
