import os
import json
import datetime
from typing import Dict, List, Any
import google.generativeai as genai
from garminconnect.workout import (
    RunningWorkout, WorkoutSegment, ExecutableStep, StepType, ConditionType, TargetType
)

# Pomocné funkcie na prevod tempa
def pace_to_ms(pace_str: str) -> float:
    """Prevedie tempo '5:30' na m/s"""
    try:
        mins, secs = map(int, pace_str.split(':'))
        total_seconds = mins * 60 + secs
        return 1000.0 / total_seconds
    except:
        return 0.0

def create_garmin_step(step_data: dict, step_order: int) -> ExecutableStep:
    """Vytvorí Garmin ExecutableStep zo slovníka od Gemini — podporuje Pace aj HR targety."""
    step_type_map = {
        "warmup":   (StepType.WARMUP,    "warmup",   1),
        "run":      (StepType.INTERVAL,  "interval", 3),
        "recover":  (StepType.RECOVERY,  "recovery", 4),
        "cooldown": (StepType.COOLDOWN,  "cooldown", 2),
    }
    st_id, st_key, st_order = step_type_map.get(step_data.get("type", "run"), step_type_map["run"])

    # Vzdialenosť v metroch
    distance_m = float(step_data.get("distance_km", 0)) * 1000.0

    # ── HR target (preferované ak je dostupné) ──
    hr_min = step_data.get("hr_min")
    hr_max = step_data.get("hr_max")
    pace_min = step_data.get("pace_min")
    pace_max = step_data.get("pace_max")

    if hr_min and hr_max:
        # HR zóna target
        target_dict = {
            "workoutTargetTypeId": TargetType.HEART_RATE,
            "workoutTargetTypeKey": "heart.rate.zone",
            "displayOrder": 4,
        }
        step = ExecutableStep(
            stepOrder=step_order,
            stepType={"stepTypeId": st_id, "stepTypeKey": st_key, "displayOrder": st_order},
            endCondition={
                "conditionTypeId": ConditionType.DISTANCE,
                "conditionTypeKey": "distance",
                "displayOrder": 1,
                "displayable": True,
            },
            endConditionValue=distance_m,
            targetType=target_dict,
        )
        step.targetValueOne = float(hr_min)
        step.targetValueTwo = float(hr_max)
        return step

    # ── Pace target ──
    ms_min = pace_to_ms(pace_max or "6:00")   # max pace = faster = higher m/s
    ms_max = pace_to_ms(pace_min or "6:30")   # min pace = slower = lower m/s

    if ms_min > 0 and ms_max > 0:
        target_dict = {
            "workoutTargetTypeId": TargetType.SPEED,
            "workoutTargetTypeKey": "speed.zone",
            "displayOrder": 5,
        }
    else:
        target_dict = {
            "workoutTargetTypeId": TargetType.NO_TARGET,
            "workoutTargetTypeKey": "no.target",
            "displayOrder": 1,
        }

    step = ExecutableStep(
        stepOrder=step_order,
        stepType={"stepTypeId": st_id, "stepTypeKey": st_key, "displayOrder": st_order},
        endCondition={
            "conditionTypeId": ConditionType.DISTANCE,
            "conditionTypeKey": "distance",
            "displayOrder": 1,
            "displayable": True,
        },
        endConditionValue=distance_m,
        targetType=target_dict,
    )
    if ms_min > 0 and ms_max > 0:
        step.targetValueOne = ms_max
        step.targetValueTwo = ms_min
    return step


def generate_weekly_plan(profile: dict, constraints: str) -> dict:
    """Generates a structured weekly plan using Gemini"""
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    if not GEMINI_API_KEY:
        raise Exception("Gemini API kľúč nie je nastavený.")
        
    genai.configure(api_key=GEMINI_API_KEY)
    
    target_time = profile.get("target_time", "neuvedený")
    ai_context = profile.get("ai_context", "")
    
    system_prompt = f"""
    Si profesionálny bežecký tréner, expert na Hanson Half-Marathon Method.
    Cieľový čas zverenca na polmaratón je: {target_time}.
    DÔLEŽITÉ OSOBNÉ POZNÁMKY K ZVERENCOVI: {ai_context}
    
    Úloha: Vytvor tréningový plán na najbližších 7 dní (od zajtra).
    Zohľadni túto dodatočnú požiadavku: "{constraints}"
    Taktiež PRÍSNE zohľadni osobné poznámky zverenca (napr. preferovaný deň odpočinku, čas behu).
    
    Pravidlá pre Hanson metódu (Paces):
    - Easy pace: o cca 40-50s pomalšie ako cieľové tempo
    - Tempo pace: presne cieľové tempo polmaratónu
    - Speed/Strength intervaly: o 10s rýchlejšie ako cieľové tempo
    
    Vygeneruj odpoveď VÝLUČNE vo formáte JSON s nasledujúcou štruktúrou:
    {{
      "coach_message": "Tvoj komentár a zhodnotenie pre zverenca (po slovensky).",
      "workouts": [
        {{
          "day_offset": 1, // 1 = zajtra, 2 = pozajtra, atd.
          "workout_name": "Názov tréningu (napr. Tempo Run 8km)",
          "description": "Popis tréningu",
          "steps": [
            {{
              "type": "warmup|run|recover|cooldown",
              "distance_km": 2.0,
              "pace_min": "5:30", // najpomalšie tempo (spodná hranica zóny)
              "pace_max": "5:20"  // najrýchlejšie tempo (horná hranica zóny)
            }}
          ]
        }}
      ]
    }}
    Uisti sa, že vraciaš LEN platný JSON.
    """
    
    model = genai.GenerativeModel('gemini-2.5-pro')
    response = model.generate_content(system_prompt)
    
    # Parse JSON z odpovede
    text = response.text.strip()
    if text.startswith("```json"):
        text = text.replace("```json", "", 1)
    if text.endswith("```"):
        text = text[:text.rfind("```")]
        
    return json.loads(text.strip())

def convert_to_garmin_workouts(ai_plan: dict) -> List[tuple[datetime.date, RunningWorkout]]:
    """Konvertuje AI JSON plán na Garmin objekty"""
    garmin_workouts = []
    base_date = datetime.date.today()
    
    for w in ai_plan.get("workouts", []):
        day_offset = int(w.get("day_offset", 1))
        target_date = base_date + datetime.timedelta(days=day_offset)
        
        garmin_steps = []
        step_order = 1
        
        for s in w.get("steps", []):
            g_step = create_garmin_step(s, step_order)
            garmin_steps.append(g_step)
            step_order += 1
            
        # Odhadovany cas trvania (vynasobime distance a priemerne tempo)
        total_duration = 0
        for s in w.get("steps", []):
            dist_km = float(s.get("distance_km", 0))
            ms_avg = pace_to_ms(s.get("pace_max", "6:00"))
            if ms_avg > 0:
                total_duration += (dist_km * 1000) / ms_avg
                
        segment = WorkoutSegment(
            segmentOrder=1,
            sportType={"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1},
            workoutSteps=garmin_steps
        )
        
        garmin_workout = RunningWorkout(
            workoutName=w.get("workout_name", "Beh"),
            description=w.get("description", ""),
            estimatedDurationInSecs=int(total_duration),
            workoutSegments=[segment]
        )
        
        garmin_workouts.append((target_date, garmin_workout))
        
    return garmin_workouts

def update_next_workout(client, profile: dict) -> dict:
    """Updates the nearest upcoming workout dynamically based on LTHR."""
    try:
        lthr_data = client.get_lactate_threshold()
    except Exception as e:
        lthr_data = {"error": str(e)}
        
    now = datetime.datetime.now()
    scheduled = client.get_scheduled_workouts(now.year, now.month)
    if isinstance(scheduled, dict):
        items = scheduled.get('calendarItems', scheduled.get('workoutScheduledDTOList', []))
    else:
        items = scheduled or []
        
    # Find all workouts from today onwards
    today_str = datetime.date.today().strftime("%Y-%m-%d")
    upcoming_workouts = [
        item for item in items 
        if item.get("date") and item.get("date") >= today_str
    ]
    
    # Sort by date
    upcoming_workouts.sort(key=lambda x: x.get("date"))
    
    if not upcoming_workouts:
        return {"status": "no_workout", "message": "Nenašiel sa žiadny naplánovaný tréning na úpravu."}
        
    old_workout = upcoming_workouts[0]
    target_date_str = old_workout.get("date")
    old_workout_name = old_workout.get("title", old_workout.get("workoutName", "Beh"))
    old_workout_id = old_workout.get("workoutId")
    
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    if not GEMINI_API_KEY:
        raise Exception("Gemini API kľúč nie je nastavený.")
        
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.5-pro')
    
    ai_context = profile.get("ai_context", "")
    
    system_prompt = f"""
    Zverenec má na dátum {target_date_str} naplánovaný tréning: {old_workout_name}.
    Cieľový čas na polmaratón: {profile.get('target_time', 'neuvedený')}
    Osobné poznámky: {ai_context}
    Jeho aktuálny LTHR (Lactate Threshold) a HR dáta z Garminu: {json.dumps(lthr_data)}
    
    Úloha: Prepočítaj tento jeden tréning (Hanson Half-Marathon Method) tak, aby presne zodpovedal jeho fyzičke a jeho zvykom (Osobné poznámky). 
    Ak nemáš dobré LTHR dáta, sprav miernu úpravu podľa bežných Hanson pravidiel.
    
    Vráť odpoveď VÝLUČNE vo formáte JSON:
    {{
      "coach_message": "Ahoj! Upravil som ti najbližší tréning podľa tvojej aktuálnej fyzičky...",
      "workout": {{
        "workout_name": "{old_workout_name} (Updated)",
        "description": "Prepočítaný tréning podľa LTHR.",
        "steps": [
          {{ "type": "warmup", "distance_km": 2.0, "pace_min": "6:30", "pace_max": "6:00" }},
          {{ "type": "run", "distance_km": 5.0, "pace_min": "5:30", "pace_max": "5:20" }},
          {{ "type": "cooldown", "distance_km": 2.0, "pace_min": "6:30", "pace_max": "6:00" }}
        ]
      }}
    }}
    """
    
    response = model.generate_content(system_prompt)
    text = response.text.strip()
    if text.startswith("```json"): text = text.replace("```json", "", 1)
    if text.endswith("```"): text = text[:text.rfind("```")]
    
    ai_response = json.loads(text.strip())
    new_w_data = ai_response.get("workout")
    
    return {
        "status": "success", 
        "coach_message": ai_response.get("coach_message"),
        "proposed_workout": new_w_data,
        "original_workout": old_workout,
        "old_workout_id": old_workout_id,
        "target_date_str": target_date_str
    }
