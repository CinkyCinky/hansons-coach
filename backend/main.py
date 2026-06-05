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

# Add modules to path so we can reuse them
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from modules.auth import get_client
from modules import fetcher
from modules.database import verify_token, get_user_profile, update_user_profile, encrypt_password
from modules import workout_generator

app = FastAPI(title="Hansons Running Coach API", version="1.0.0")
security = HTTPBearer()

# Allow CORS for local dev and frontend deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup Gemini AI
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Models
class ChatRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = []

class ProfileUpdate(BaseModel):
    garmin_email: Optional[str] = None
    garmin_password: Optional[str] = None
    target_time: Optional[str] = None

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid authentication token")
    return user.id

def get_garmin_client(user_id: str = Depends(get_current_user)):
    try:
        client = get_client(user_id)
        return client
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Garmin Authentication failed: {str(e)}")

@app.get("/")
def read_root():
    return {"status": "ok", "app": "Hansons Running Coach"}

@app.get("/api/profile")
def get_profile(user_id: str = Depends(get_current_user)):
    profile = get_user_profile(user_id)
    if not profile:
        return {"id": user_id, "garmin_email": None, "target_time": None}
    
    # Hide password in response
    if "garmin_password_encrypted" in profile:
        del profile["garmin_password_encrypted"]
        
    return profile

@app.post("/api/profile")
def update_profile(req: ProfileUpdate, user_id: str = Depends(get_current_user)):
    update_data = {}
    if req.garmin_email:
        update_data["garmin_email"] = req.garmin_email
    if req.garmin_password:
        update_data["garmin_password_encrypted"] = encrypt_password(req.garmin_password)
    if req.target_time:
        update_data["target_time"] = req.target_time
        
    updated = update_user_profile(user_id, update_data)
    return {"status": "success", "profile": updated}

@app.get("/api/dashboard/today")
def get_dashboard_today(client = Depends(get_garmin_client)):
    """Returns today's data (Sleep, HRV, Body Battery, Stress, Readiness)"""
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.datetime.now() - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    
    try:
        sleep_data = fetcher.get_sleep_data(client, days=1)
        sleep = sleep_data[0] if sleep_data else {}
        hrv = fetcher.get_hrv_data(client) or {}
        stats = fetcher.get_stats_summary(client) or {}
        readiness = fetcher.get_training_readiness(client) or {}
        bb = fetcher.get_body_battery(client) or {}
        activities = fetcher.get_recent_activities(client, days=7)
        
        # Format the data cleanly for frontend
        return {
            "date": today,
            "sleep": sleep,
            "hrv": hrv,
            "stats": {
                **stats,
                "body_battery_highest": bb.get("today_charged")
            },
            "readiness": {
                "readiness_score": readiness.get("score"),
                "readiness_status": readiness.get("level")
            },
            "activities": activities[:5] if activities else []
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class AdviceRequest(BaseModel):
    sleep_score: Optional[int] = None
    hrv_status: Optional[str] = None
    body_battery: Optional[int] = None
    readiness: Optional[int] = None

@app.post("/api/dashboard/advice")
def get_dashboard_advice(metrics: AdviceRequest, user_id: str = Depends(get_current_user), client = Depends(get_garmin_client)):
    """Generates a short, punchy AI advice based on today's metrics and next workout"""
    if not GEMINI_API_KEY:
        return {"advice": "Pre plnohodnotné rady si nastav Gemini API kľúč."}
        
    try:
        next_workout_str = "Dnes/Zajtra ťa nečaká žiadny špecifický tréning."
        try:
            now = datetime.datetime.now()
            scheduled = client.get_scheduled_workouts(now.year, now.month)
            items = scheduled.get('calendarItems', scheduled.get('workoutScheduledDTOList', [])) if isinstance(scheduled, dict) else scheduled or []
            today_str = datetime.date.today().strftime("%Y-%m-%d")
            upcoming = [item for item in items if item.get("date") and item.get("date") >= today_str]
            upcoming.sort(key=lambda x: x.get("date"))
            if upcoming:
                nw = upcoming[0]
                next_workout_str = f"Najbližší naplánovaný tréning: {nw.get('date')} - {nw.get('title', 'Beh')}"
        except Exception:
            pass

        model = genai.GenerativeModel('gemini-2.5-flash')
        
        prompt = f"""
        Si bežecký tréner (Hansonova metóda). Zhodnoť dnešný stav zverenca 
        a daj mu 2-3 krátke a úderné vety s odporúčaním na dnešný deň.
        Ak je najbližší tréning blízko a hodnoty zverenca (Body Battery, Spánok) sú slabé, 
        odporúč mu, nech si v sekcii Plán 'Prepočíta najbližší tréning'. Ak sú hodnoty super, povzbuď ho, že to zvládne.
        Používaj slovenčinu, buď povzbudivý, občas použi emoji.
        
        Dnešné dáta z Garminu:
        - Spánok: {metrics.sleep_score}/100
        - HRV: {metrics.hrv_status}
        - Body Battery: {metrics.body_battery}/100
        - Pripravenosť na tréning: {metrics.readiness}/100
        
        {next_workout_str}
        """
        
        response = model.generate_content(prompt)
        return {"advice": response.text.strip()}
    except Exception as e:
        return {"advice": "Dnes ťa neviem zhodnotiť, bež podľa pocitu! 🏃‍♂️"}

@app.get("/api/plan/scheduled")
def get_scheduled_plan(client = Depends(get_garmin_client)):
    """Gets scheduled workouts from the Garmin calendar, enriched with activityId for completed runs"""
    now = datetime.datetime.now()
    try:
        scheduled = client.get_scheduled_workouts(now.year, now.month)
        # Handle dict or list return type from garminconnect
        if isinstance(scheduled, dict):
            items = scheduled.get('calendarItems', scheduled.get('workoutScheduledDTOList', []))
        else:
            items = scheduled or []
        
        # Enrich past items with activityId by matching real activities by date
        today_str = datetime.date.today().strftime("%Y-%m-%d")
        try:
            recent_activities = fetcher.get_recent_activities(client, days=35) or []
            # Build date -> list of activities map
            act_by_date: Dict[str, list] = {}
            for act in recent_activities:
                act_date = (act.get("startTimeLocal") or "")[:10]
                if act_date:
                    act_by_date.setdefault(act_date, []).append(act)
            
            # Match each past calendar item to the closest activity on the same date
            for item in items:
                item_date = (item.get("date") or "")[:10]
                # Only enrich past items that don't already have an activityId
                if item_date and item_date < today_str and not item.get("activityId"):
                    day_acts = act_by_date.get(item_date, [])
                    if day_acts:
                        # Pick first running activity on that date
                        running = [a for a in day_acts if (a.get("activityType", {}).get("typeKey") or "").lower() in ("running", "track_running", "treadmill_running")]
                        chosen = running[0] if running else day_acts[0]
                        item["activityId"] = chosen.get("activityId")
                        item["activityName"] = chosen.get("activityName", "")
        except Exception as enrich_err:
            print(f"Activity enrichment failed: {enrich_err}")
        
        return {"workouts": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/debug/raw")
def debug_raw(client = Depends(get_garmin_client)):
    """Debug endpoint: returns raw Garmin data to inspect field names"""
    now = datetime.datetime.now()
    try:
        scheduled_raw = client.get_scheduled_workouts(now.year, now.month)
        activities_raw = client.get_activities(0, 5)
        return {
            "scheduled_raw": scheduled_raw,
            "activities_raw": activities_raw,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/plan/workout/{workout_id}")
def get_workout_details(workout_id: str, client = Depends(get_garmin_client)):
    """Gets detailed info for a specific workout, including steps, notes, and HR targets"""
    try:
        details = client.get_workout(workout_id)
        if not isinstance(details, dict):
            return {"workout": details}

        # Extract workout-level notes (Garmin calls it "description" or "notes" or "workoutNotes")
        workout_notes = (
            details.get("description") or
            details.get("workoutNotes") or
            details.get("workoutDescription") or
            ""
        )

        # Parse workout steps with full detail (HR targets, descriptions, distances)
        steps_summary = []
        total_dist_m = 0
        for seg in (details.get("workoutSegments") or []):
            for step in (seg.get("workoutSteps") or []):
                step_type = (step.get("stepType") or {}).get("stepTypeKey", "run")
                dist_m = step.get("endConditionValue", 0) or 0
                dist_km = round(dist_m / 1000, 1) if dist_m else None
                total_dist_m += dist_m

                # Step-level description/notes
                step_notes = (
                    step.get("description") or
                    step.get("stepNotes") or
                    step.get("notes") or
                    ""
                )

                # Determine target type: HR or speed
                target_type = str((step.get("targetType") or {}).get("workoutTargetTypeKey") or "")
                target_str = ""
                t_low = step.get("targetValueOne")
                t_high = step.get("targetValueTwo")

                if "heart" in target_type.lower() and t_low and t_high:
                    # HR zone target (bpm)
                    target_str = f"{int(t_low)}-{int(t_high)} bpm"
                    target_kind = "hr"
                elif t_low and t_high and float(t_low) > 0:
                    # Speed target (m/s) → convert to pace min/km
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
def get_activity_stats(activity_id: str, client = Depends(get_garmin_client)):
    """Gets real stats from a completed activity by activityId"""
    try:
        details = client.get_activity(activity_id)
        splits = None
        try:
            splits = client.get_activity_splits(activity_id)
        except Exception:
            pass

        # Format the key stats cleanly
        d = details if isinstance(details, dict) else {}
        summary = {
            "distance_km": round(d.get("distance", 0) / 1000, 2) if d.get("distance") else None,
            "duration_min": round(d.get("duration", 0) / 60, 1) if d.get("duration") else None,
            "avg_pace_sec_km": round(1000 / d["averageSpeed"]) if d.get("averageSpeed") else None,
            "avg_hr": d.get("averageHR"),
            "max_hr": d.get("maxHR"),
            "avg_cadence": d.get("averageRunningCadenceInStepsPerMinute") or d.get("averageBikingCadenceInRevPerMinute"),
            "total_ascent": d.get("elevationGain"),
            "calories": d.get("calories"),
            "training_effect": d.get("aerobicTrainingEffect"),
            "hr_zones": d.get("hrTimeInZones") or d.get("heartRateZones"),
            "splits": splits.get("lapDTOs") if splits and isinstance(splits, dict) else None,
        }
        return {"stats": summary, "name": d.get("activityName", "")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class PlanGenerateRequest(BaseModel):
    constraints: str

@app.post("/api/plan/generate")
def api_generate_plan(req: PlanGenerateRequest, user_id: str = Depends(get_current_user)):
    profile = get_user_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profil nenajdený")
    try:
        plan_json = workout_generator.generate_weekly_plan(profile, req.constraints)
        return plan_json
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class PlanUploadRequest(BaseModel):
    plan_data: dict

@app.post("/api/plan/upload")
def api_upload_plan(req: PlanUploadRequest, client = Depends(get_garmin_client)):
    try:
        garmin_workouts = workout_generator.convert_to_garmin_workouts(req.plan_data)
        uploaded = []
        for target_date, workout in garmin_workouts:
            # 1. Upload workout
            resp = client.upload_running_workout(workout)
            workout_id = resp.get("workoutId")
            
            if workout_id:
                # 2. Schedule workout
                date_str = target_date.strftime("%Y-%m-%d")
                client.schedule_workout(workout_id, date_str)
                uploaded.append({"date": date_str, "name": workout.workoutName, "id": workout_id})
                
        return {"status": "success", "uploaded": uploaded}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/plan/daily_update")
def generate_daily_update(client = Depends(get_garmin_client), user_id: str = Depends(get_current_user)):
    """Generates an AI proposal for updating the next scheduled workout (does not save to Garmin)"""
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
def confirm_daily_update(req: WorkoutConfirmRequest, client = Depends(get_garmin_client)):
    """Saves the confirmed AI workout to Garmin and deletes the old one"""
    try:
        new_w_data = req.workout
        old_workout_id = req.old_workout_id
        target_date_str = req.target_date_str
        
        garmin_steps = []
        for i, s in enumerate(new_w_data.get("steps", [])):
            garmin_steps.append(workout_generator.create_garmin_step(s, i+1))
            
        segment = workout_generator.WorkoutSegment(
            segmentOrder=1, sportType={"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1},
            workoutSteps=garmin_steps
        )
        gw = workout_generator.RunningWorkout(
            workoutName=new_w_data.get("workout_name", "Updated Workout"),
            description=new_w_data.get("description", ""),
            estimatedDurationInSecs=0,
            workoutSegments=[segment]
        )
        
        # Upload new first
        resp = client.upload_running_workout(gw)
        new_id = resp.get("workoutId")
        if new_id:
            # Schedule the new one
            client.schedule_workout(new_id, target_date_str)
            # Delete the old one only if new succeeds
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


@app.post("/api/chat")
def chat_with_coach(req: ChatRequest, user_id: str = Depends(get_current_user), client = Depends(get_garmin_client)):
    """Communicates with Gemini AI acting as the running coach, with full Garmin context"""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")
        
    profile = get_user_profile(user_id)
    target_time = profile.get("target_time", "neuvedený") if profile else "neuvedený"

    # Load fresh Garmin context
    garmin_context = ""
    try:
        activities = fetcher.get_recent_activities(client, days=14)
        sleep_data = fetcher.get_sleep_data(client, days=3)
        hrv = fetcher.get_hrv_data(client) or {}
        bb = fetcher.get_body_battery(client) or {}
        readiness = fetcher.get_training_readiness(client) or {}
        stats = fetcher.get_stats_summary(client) or {}

        # Last 5 runs summary
        runs_summary = []
        for a in (activities or [])[:5]:
            d_km = round(a.get("distance", 0) / 1000, 1)
            avg_pace_s = round(1000 / a["averageSpeed"]) if a.get("averageSpeed") else None
            pace_str = f"{avg_pace_s // 60}:{avg_pace_s % 60:02d}/km" if avg_pace_s else "N/A"
            runs_summary.append(f"  - {a.get('startTimeLocal','')[:10]}: {d_km}km @ {pace_str}, HR {a.get('averageHR','?')}bpm, kadencia {a.get('averageRunningCadenceInStepsPerMinute','?')} spm")

        # Next workout from calendar
        next_w_str = "Žiadny naplánovaný tréning."
        try:
            now = datetime.datetime.now()
            scheduled = client.get_scheduled_workouts(now.year, now.month)
            items = scheduled.get('calendarItems', scheduled.get('workoutScheduledDTOList', [])) if isinstance(scheduled, dict) else scheduled or []
            today_str = datetime.date.today().strftime("%Y-%m-%d")
            upcoming = sorted([i for i in items if i.get("date") and i.get("date") >= today_str], key=lambda x: x.get("date"))
            if upcoming:
                nw = upcoming[0]
                next_w_str = f"{nw.get('date')} – {nw.get('title', 'Beh')}"
        except Exception:
            pass

        garmin_context = f"""
--- AKTUÁLNE GARMIN DÁTA ZVERENCA ---
Dnešné zdravotné metriky:
- Body Battery: {bb.get('today_charged', 'N/A')}/100
- HRV stav: {hrv.get('status', 'N/A')} (weekly avg: {hrv.get('weekly_avg', 'N/A')} ms)
- Pokojový tep: {stats.get('resting_hr', 'N/A')} bpm
- Pripravenosť na tréning: {readiness.get('score', 'N/A')}/100
- Spánok dnes: {sleep_data[0].get('duration_hours', 'N/A') if sleep_data else 'N/A'} hod (skóre: {sleep_data[0].get('score', 'N/A') if sleep_data else 'N/A'})

Posledné behy (posledných 14 dní):
{chr(10).join(runs_summary) if runs_summary else 'Žiadne aktivity.'}

Najbližší naplánovaný tréning: {next_w_str}
--- KONIEC GARMIN DÁT ---
"""
    except Exception as e:
        garmin_context = f"(Garmin dáta sa nepodarilo načítať: {e})"
    
    system_instruction = (
        f"Si osobný AI bežecký tréner používateľa. "
        f"Prísne sa riadíš Hansons Half-Marathon Advanced metódou. "
        f"Cieľový čas na polmaratón: {target_time}. "
        f"VŽDY hovor po slovensky. Buď konkrétny, stručný a povzbudivý. "
        f"Odpovede prispôsob mobilnej aplikácii – max 4-5 viet. "
        f"Nikdy sa NEPÝTAJ na veci, ktoré vieš z Garmin dát nižšie. "
        f"Na základe Garmin dát dávaj konkrétne rady. "
        f"\n{garmin_context}"
    )
    
    try:
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=system_instruction
        )
        
        # Convert history
        formatted_history = []
        for msg in req.history:
            role = "user" if msg["role"] == "user" else "model"
            formatted_history.append({"role": role, "parts": [msg["content"]]})
            
        chat = model.start_chat(history=formatted_history)
        response = chat.send_message(req.message)
        
        return {"response": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
