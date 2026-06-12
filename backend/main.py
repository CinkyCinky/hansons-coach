from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import datetime
import os
import sys
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import google.generativeai as genai
from dotenv import load_dotenv

# Load env variables
load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from modules.auth import get_client
from modules import fetcher
from modules.database import verify_token, get_user_profile, update_user_profile, encrypt_password
from modules import workout_generator

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
    allow_origins=allowed_origins if FRONTEND_URL else ["*"],
    allow_origin_regex=r"https://.*\.vercel\.app" if "vercel.app" in FRONTEND_URL else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup Gemini AI
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

GEMINI_MODELS = {
    "flash": "gemini-2.5-flash",
    "pro": "gemini-2.5-pro",
}


# ── Models ──────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = []
    model: str = "flash"  # "flash" | "pro"

class ProfileUpdate(BaseModel):
    garmin_email: Optional[str] = None
    garmin_password: Optional[str] = None
    target_time: Optional[str] = None
    training_start_date: Optional[str] = None  # YYYY-MM-DD


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
        activities = fetcher.get_recent_activities(client, days=7)

        # Dnešný naplánovaný tréning
        today_workout = None
        try:
            now = datetime.datetime.now()
            scheduled = client.get_scheduled_workouts(now.year, now.month)
            items = (
                scheduled.get("calendarItems", scheduled.get("workoutScheduledDTOList", []))
                if isinstance(scheduled, dict)
                else scheduled or []
            )
            today_str = datetime.date.today().strftime("%Y-%m-%d")
            today_items = [i for i in items if (i.get("date") or "")[:10] == today_str]
            if today_items:
                today_workout = today_items[0]
        except Exception:
            pass

        return {
            "date": today,
            "training_week": training_week,
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
            "activities": activities[:5] if activities else [],
            "today_workout": today_workout,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
            now = datetime.datetime.now()
            scheduled = client.get_scheduled_workouts(now.year, now.month)
            items = (
                scheduled.get("calendarItems", scheduled.get("workoutScheduledDTOList", []))
                if isinstance(scheduled, dict)
                else scheduled or []
            )
            today_str = datetime.date.today().strftime("%Y-%m-%d")
            upcoming = sorted(
                [i for i in items if i.get("date") and i.get("date") >= today_str],
                key=lambda x: x.get("date"),
            )
            if upcoming:
                nw = upcoming[0]
                next_workout_str = f"Najbližší tréning: {nw.get('date')} - {nw.get('title', 'Beh')}"
        except Exception:
            pass

        # Vypočítaj stav formy (0-100) pre prompt
        values = [v for v in [metrics.sleep_score, metrics.body_battery, metrics.readiness] if v is not None]
        form_score = int(sum(values) / len(values)) if values else 50

        model = genai.GenerativeModel("gemini-2.5-flash")
        prompt = f"""Si bežecký tréner (Hansonova metóda). Zhodnoť dnešný stav zverenca a daj mu 2-3 krátke úderné vety.
Ak sú hodnoty slabé (Body Battery alebo Pripravenosť pod 50), odporúč mu nech si v sekcii Plán prepočíta tréning.
Ak sú hodnoty super, povzbuď ho. Používaj slovenčinu, buď povzbudivý, občas emoji.

Stav formy dnes: {form_score}/100
- Spánok skóre: {metrics.sleep_score}/100
- HRV: {metrics.hrv_status}
- Body Battery: {metrics.body_battery}/100
- Pripravenosť: {metrics.readiness}/100
{next_workout_str}"""

        response = model.generate_content(prompt)
        return {"advice": response.text.strip()}
    except Exception:
        return {"advice": "Dnes ťa neviem zhodnotiť, bež podľa pocitu! 🏃‍♂️"}


# ── Plan ─────────────────────────────────────────────────────────────────────

@app.get("/api/plan/scheduled")
def get_scheduled_plan(client=Depends(get_garmin_client)):
    """Vráti naplánované tréningy z Garmin kalendára, obohatené o activityId pre splnené behy."""
    now = datetime.datetime.now()
    try:
        scheduled = client.get_scheduled_workouts(now.year, now.month)
        items = (
            scheduled.get("calendarItems", scheduled.get("workoutScheduledDTOList", []))
            if isinstance(scheduled, dict)
            else scheduled or []
        )

        today_str = datetime.date.today().strftime("%Y-%m-%d")
        try:
            recent_activities = fetcher.get_recent_activities(client, days=35) or []
            act_by_date: Dict[str, list] = {}
            for act in recent_activities:
                act_date = (act.get("startTimeLocal") or "")[:10]
                if act_date:
                    act_by_date.setdefault(act_date, []).append(act)

            for item in items:
                item_date = (item.get("date") or "")[:10]
                if item_date and item_date < today_str and not item.get("activityId"):
                    day_acts = act_by_date.get(item_date, [])
                    if day_acts:
                        running = [
                            a for a in day_acts
                            if (a.get("activityType", {}).get("typeKey") or "").lower()
                            in ("running", "track_running", "treadmill_running")
                        ]
                        chosen = running[0] if running else day_acts[0]
                        item["activityId"] = chosen.get("activityId")
                        item["activityName"] = chosen.get("activityName", "")
        except Exception as enrich_err:
            print(f"Activity enrichment failed: {enrich_err}")

        return {"workouts": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/plan/workout/{workout_id}")
def get_workout_details(workout_id: str, client=Depends(get_garmin_client)):
    """Detailné info o konkrétnom tréningu — kroky, HR targety, poznámky."""
    try:
        details = client.get_workout(workout_id)
        if not isinstance(details, dict):
            return {"workout": details}

        workout_notes = (
            details.get("description")
            or details.get("workoutNotes")
            or details.get("workoutDescription")
            or ""
        )

        steps_summary = []
        total_dist_m = 0
        for seg in details.get("workoutSegments") or []:
            for step in seg.get("workoutSteps") or []:
                step_type = (step.get("stepType") or {}).get("stepTypeKey", "run")
                dist_m = step.get("endConditionValue", 0) or 0
                dist_km = round(dist_m / 1000, 1) if dist_m else None
                total_dist_m += dist_m

                step_notes = (
                    step.get("description")
                    or step.get("stepNotes")
                    or step.get("notes")
                    or ""
                )

                target_type = str((step.get("targetType") or {}).get("workoutTargetTypeKey") or "")
                target_str = ""
                t_low = step.get("targetValueOne")
                t_high = step.get("targetValueTwo")

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
                        target_str = ""
                        target_kind = "none"
                else:
                    target_kind = "none"

                steps_summary.append({
                    "type": step_type,
                    "distance_km": dist_km,
                    "target": target_str,
                    "target_kind": target_kind,
                    "notes": step_notes,
                })

        enriched = {
            **details,
            "description": workout_notes,
            "workoutName": details.get("workoutName", ""),
            "total_distance_km": round(total_dist_m / 1000, 1) if total_dist_m else None,
            "steps_summary": steps_summary,
        }
        return {"workout": enriched}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
            "avg_hr": summary.get("averageHR"),
            "max_hr": summary.get("maxHR"),
            "avg_cadence": (
                summary.get("averageRunningCadenceInStepsPerMinute")
                or summary.get("averageCadence")
            ),
            "total_ascent": summary.get("elevationGain"),
            "calories": summary.get("calories"),
            "training_effect": summary.get("trainingEffect"),
            "splits": splits.get("lapDTOs") if splits and isinstance(splits, dict) else None,
        }
        return {"stats": stats, "activity": details}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class PlanGenerateRequest(BaseModel):
    constraints: str

@app.post("/api/plan/generate")
def api_generate_plan(req: PlanGenerateRequest, user_id: str = Depends(get_current_user)):
    profile = get_user_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profil nenájdený")
    try:
        plan_json = workout_generator.generate_weekly_plan(profile, req.constraints)
        return plan_json
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/plan/daily_update")
def generate_daily_update(client=Depends(get_garmin_client), user_id: str = Depends(get_current_user)):
    """Generuje AI návrh na úpravu najbližšieho tréningu podľa LTHR."""
    try:
        profile = get_user_profile(user_id) or {}
        proposal = workout_generator.update_next_workout(client, profile)
        return proposal
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Reports ───────────────────────────────────────────────────────────────────

@app.get("/api/reports/weekly")
def get_weekly_report(client=Depends(get_garmin_client)):
    """
    Vráti reálne Garmin dáta za posledných 7 dní pre Reports stránku:
    - aktivity (km, tempo, HR, kadencia)
    - spánok (hodiny, skóre)
    - HRV (ms weekly_avg, last_night)
    - body battery
    """
    try:
        activities = fetcher.get_recent_activities(client, days=7) or []
        sleep_data = fetcher.get_sleep_data(client, days=7) or []
        hrv_data = fetcher.get_hrv_data(client) or {}
        bb_data = fetcher.get_body_battery(client) or {}

        # Spracuj behy pre graf
        runs = []
        for act in activities:
            if (act.get("activityType", {}).get("typeKey") or "").lower() not in (
                "running", "track_running", "treadmill_running"
            ):
                continue
            avg_speed = act.get("averageSpeed")
            avg_pace_sec = round(1000 / avg_speed) if avg_speed else None
            runs.append({
                "date": (act.get("startTimeLocal") or "")[:10],
                "name": act.get("activityName", "Beh"),
                "distance_km": round((act.get("distance") or 0) / 1000, 2),
                "avg_pace_sec": avg_pace_sec,
                "avg_pace_str": (
                    f"{avg_pace_sec // 60}:{avg_pace_sec % 60:02d}"
                    if avg_pace_sec else None
                ),
                "avg_hr": act.get("averageHR"),
                "avg_cadence": act.get("averageRunningCadenceInStepsPerMinute") or act.get("averageCadence"),
                "calories": act.get("calories"),
            })

        total_km = round(sum(r["distance_km"] for r in runs), 1)
        avg_sleep = (
            round(sum(s.get("duration_hours") or 0 for s in sleep_data) / len(sleep_data), 1)
            if sleep_data else None
        )

        # Body battery denné hodnoty pre graf
        bb_daily = []
        if bb_data.get("raw"):
            for entry in bb_data["raw"]:
                bb_daily.append({
                    "date": entry.get("date", ""),
                    "charged": entry.get("charged"),
                })

        return {
            "period_days": 7,
            "total_km": total_km,
            "avg_sleep_hours": avg_sleep,
            "runs": runs,
            "sleep": sleep_data,
            "hrv": hrv_data,
            "body_battery": {
                "today": bb_data.get("today_charged"),
                "weekly_avg": bb_data.get("weekly_avg"),
                "daily": bb_daily,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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

    # Model selection
    model_name = GEMINI_MODELS.get(req.model, GEMINI_MODELS["flash"])

    # Načítaj Garmin kontext
    garmin_context = ""
    try:
        activities = fetcher.get_recent_activities(client, days=14)
        sleep_data = fetcher.get_sleep_data(client, days=3)
        hrv = fetcher.get_hrv_data(client) or {}
        bb = fetcher.get_body_battery(client) or {}
        readiness = fetcher.get_training_readiness(client) or {}
        stats = fetcher.get_stats_summary(client) or {}

        runs_summary = []
        for a in (activities or [])[:5]:
            d_km = round((a.get("distance") or 0) / 1000, 1)
            avg_speed = a.get("averageSpeed")
            pace_sec = round(1000 / avg_speed) if avg_speed else None
            pace_str = f"{pace_sec // 60}:{pace_sec % 60:02d}/km" if pace_sec else "N/A"
            runs_summary.append(
                f"  - {(a.get('startTimeLocal') or '')[:10]}: {d_km}km @ {pace_str}, "
                f"HR {a.get('averageHR', '?')}bpm, "
                f"kadencia {a.get('averageRunningCadenceInStepsPerMinute', '?')} spm"
            )

        next_w_str = "Žiadny naplánovaný tréning."
        try:
            now = datetime.datetime.now()
            scheduled = client.get_scheduled_workouts(now.year, now.month)
            items = (
                scheduled.get("calendarItems", scheduled.get("workoutScheduledDTOList", []))
                if isinstance(scheduled, dict)
                else scheduled or []
            )
            today_str = datetime.date.today().strftime("%Y-%m-%d")
            upcoming = sorted(
                [i for i in items if i.get("date") and i.get("date") >= today_str],
                key=lambda x: x.get("date"),
            )
            if upcoming:
                nw = upcoming[0]
                next_w_str = f"{nw.get('date')} – {nw.get('title', 'Beh')}"
        except Exception:
            pass

        first_sleep = sleep_data[0] if sleep_data else {}
        garmin_context = f"""
--- GARMIN DÁTA ---
Týždeň prípravy: {training_week}/18
Body Battery: {bb.get('today_charged', 'N/A')}/100
HRV: {hrv.get('status', 'N/A')} (last night: {hrv.get('last_night', 'N/A')} ms, weekly avg: {hrv.get('weekly_avg', 'N/A')} ms)
Pokojový tep: {stats.get('resting_hr', 'N/A')} bpm
Pripravenosť: {readiness.get('score', 'N/A')}/100
Spánok dnes: {first_sleep.get('duration_hours', 'N/A')} hod (skóre: {first_sleep.get('score', 'N/A')})

Posledné behy (14 dní):
{chr(10).join(runs_summary) if runs_summary else 'Žiadne aktivity.'}

Najbližší tréning: {next_w_str}
--- KONIEC ---"""
    except Exception as e:
        garmin_context = f"(Garmin dáta sa nepodarilo načítať: {e})"

    today_full = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    system_instruction = (
        f"Si osobný AI bežecký tréner. Prísne sa riadíš Hansons Half-Marathon Advanced metódou. "
        f"Dnešný dátum a čas: {today_full}. "
        f"Cieľový čas: {target_time}. Aktuálny týždeň prípravy: {training_week}/18. "
        f"VŽDY hovor po slovensky. Buď konkrétny, stručný a povzbudivý. "
        f"Odpovede prispôsob mobilnej aplikácii – max 4-5 viet. "
        f"Nikdy sa NEPÝTAJ na veci, ktoré vieš z Garmin dát. "
        f"\n{garmin_context}"
    )

    try:
        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=system_instruction,
        )

        formatted_history = []
        for msg in req.history:
            role = "user" if msg["role"] == "user" else "model"
            formatted_history.append({"role": role, "parts": [msg["content"]]})

        chat = model.start_chat(history=formatted_history)
        response = chat.send_message(req.message)

        return {"response": response.text, "model_used": model_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
