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
    """Vytvorí Garmin ExecutableStep zo slovníka od Gemini"""
    step_type_map = {
        "warmup": (StepType.WARMUP, "warmup", 1),
        "run": (StepType.INTERVAL, "interval", 3),
        "recover": (StepType.RECOVERY, "recovery", 4),
        "cooldown": (StepType.COOLDOWN, "cooldown", 2)
    }
    
    st_id, st_key, st_order = step_type_map.get(step_data.get("type", "run"), step_type_map["run"])
    
    # Distance in meters
    distance_m = float(step_data.get("distance_km", 0)) * 1000.0
    
    # Paces
    pace_min = step_data.get("pace_min", "6:00")
    pace_max = step_data.get("pace_max", "5:30")
    
    ms_min = pace_to_ms(pace_max) # max pace means faster, which is higher m/s
    ms_max = pace_to_ms(pace_min) # min pace means slower, which is lower m/s
    
    # Garmin targetType pre Pace je SPEED (m/s)
    target_dict = {
        "workoutTargetTypeId": TargetType.SPEED,
        "workoutTargetTypeKey": "speed.zone",
        "displayOrder": 5,
    }
    
    # Ak nemame tempo, posleme bez targetu
    if ms_min == 0 or ms_max == 0:
        target_dict = {
            "workoutTargetTypeId": TargetType.NO_TARGET,
            "workoutTargetTypeKey": "no.target",
            "displayOrder": 1,
        }
        
    step = ExecutableStep(
        stepOrder=step_order,
        stepType={
            "stepTypeId": st_id,
            "stepTypeKey": st_key,
            "displayOrder": st_order,
        },
        endCondition={
            "conditionTypeId": ConditionType.DISTANCE,
            "conditionTypeKey": "distance",
            "displayOrder": 1,
            "displayable": True,
        },
        endConditionValue=distance_m,
        targetType=target_dict
    )
    
    # Extra polia pre rýchlosť, pydantic extra="allow" to dovolí
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
    
    system_prompt = f"""
    Si profesionálny bežecký tréner, expert na Hanson Half-Marathon Method.
    Cieľový čas zverenca na polmaratón je: {target_time}.
    
    Úloha: Vytvor tréningový plán na najbližších 7 dní (od zajtra).
    Zohľadni túto požiadavku od zverenca: "{constraints}"
    
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
    
    model = genai.GenerativeModel('gemini-2.5-flash')
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
