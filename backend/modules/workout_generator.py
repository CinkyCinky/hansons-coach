import os
import json
import datetime
from typing import Dict, List, Any, Optional
import google.generativeai as genai
from garminconnect.workout import (
    RunningWorkout, WorkoutSegment, ExecutableStep, StepType, ConditionType, TargetType
)
from modules import fetcher, hansons_knowledge


def _gather_athlete_context(client, profile: dict) -> str:
    """Pozbiera živé dáta z Garminu (osobný profil, LTHR, HR zóny) + vypočítané tempá
    a vráti hotový textový blok pre AI prompt. Toto robí trénera 'múdrym'."""
    blocks = [hansons_knowledge.HANSONS_METHODOLOGY]

    goal = profile.get("target_time")
    if goal:
        blocks.append(hansons_knowledge.paces_block(goal))

    if client is not None:
        try:
            athlete = fetcher.get_athlete_profile(client)
            blocks.append(hansons_knowledge.athlete_block(athlete))

            lthr_data = fetcher.get_lactate_threshold(client) or {}
            max_hr = fetcher.get_max_hr_from_activities(client, days=90)
            stats = fetcher.get_stats_summary(client) or {}
            zones = fetcher.compute_hr_zones(
                lthr_data.get("lthr") or (athlete or {}).get("lthr"),
                max_hr,
                stats.get("resting_hr"),
            )
            blocks.append(hansons_knowledge.hr_zones_block(
                zones, lthr_data.get("lthr_pace") or (athlete or {}).get("lthr_pace")
            ))
        except Exception as e:
            blocks.append(f"\n(Časť živých Garmin dát sa nepodarilo načítať: {e})\n")

    return "".join(b for b in blocks if b)

def training_timeline_note(profile: dict) -> str:
    """Slovenský pokyn pre AI o časovej osi prípravy (skorý/štandardný/zhustený/neskorý nábeh)."""
    race = profile.get("race_date")
    start = profile.get("training_start_date")
    if not race:
        return ""
    try:
        today = datetime.date.today()
        race_d = datetime.date.fromisoformat(str(race)[:10])
        start_d = (
            datetime.date.fromisoformat(str(start)[:10])
            if start else race_d - datetime.timedelta(days=126)
        )
        eff = max(today, start_d)  # trénovať v minulosti sa nedá
        prep_weeks = max(0, round((race_d - eff).days / 7))
        weeks_to_race = max(0, (race_d - today).days // 7)
        if prep_weeks >= 19:
            sit = ("Zverenec má viac než štandardných 18 týždňov — začni opatrne, prvé týždne "
                   "nižší objem a viac ľahkých (Easy) behov, postupne nabiehaj na plný Hanson objem.")
        elif prep_weeks >= 16:
            sit = "Štandardný 18-týždňový Hanson plán."
        elif prep_weeks >= 10:
            sit = ("Menej než 18 týždňov — plán zhusti: vynechaj najľahšiu úvodnú fázu a rýchlejšie "
                   "zvyšuj záťaž, ale rozumne, bez rizika zranenia.")
        elif prep_weeks >= 4:
            sit = ("Veľmi krátka príprava — zameraj sa na kľúčové tréningy (tempo, dlhý beh), "
                   "drž realistické očakávania a varuj pred preťažením.")
        else:
            sit = ("Na plnú Hanson prípravu je už neskoro — odporuč brať preteky skôr ako tréningové "
                   "a nepreháňať to s tempom.")
        return (f"\nČASOVÝ KONTEXT: dnes {today.isoformat()}, preteky {race_d.isoformat()}, "
                f"začiatok prípravy {start_d.isoformat()}, do pretekov ~{weeks_to_race} týž., "
                f"reálne ~{prep_weeks} týž. prípravy. {sit}\n")
    except Exception:
        return ""


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

    # ── Pace target (len ak je tempo skutočne zadané) ──
    if pace_min or pace_max:
        ms_min = pace_to_ms(pace_max or pace_min)   # rýchlejšie tempo = vyššie m/s
        ms_max = pace_to_ms(pace_min or pace_max)   # pomalšie tempo = nižšie m/s
    else:
        ms_min = ms_max = 0.0

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


def generate_weekly_plan(profile: dict, constraints: str, client=None) -> dict:
    """Vygeneruje 7-dňový plán podľa Hanson metódy s plnou metodikou + živými Garmin dátami."""
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    if not GEMINI_API_KEY:
        raise Exception("Gemini API kľúč nie je nastavený.")

    genai.configure(api_key=GEMINI_API_KEY)

    target_time = profile.get("target_time", "neuvedený")
    ai_context = profile.get("ai_context", "")
    athlete_context = _gather_athlete_context(client, profile)

    system_prompt = f"""Si profesionálny bežecký tréner, špičkový expert na Hanson Half-Marathon Method.
Tvoja úloha je vytvoriť tréningový plán PRESNE podľa Hansonovej metodiky (nižšie) a podľa
REÁLNYCH dát zverenca z Garminu (vek, váha, VO2max, LTHR, HR zóny, tempá).

Cieľový čas na polmaratón: {target_time}.
OSOBNÉ POZNÁMKY K ZVERENCOVI: {ai_context}
{training_timeline_note(profile)}
{athlete_context}

Úloha: Vytvor tréningový plán na najbližších 7 dní (od zajtra).
Dodatočná požiadavka zverenca: "{constraints}"
PRÍSNE rešpektuj osobné poznámky (deň odpočinku, čas behu, zranenia).

KĽÚČOVÉ PRAVIDLÁ PRE VÝSTUP:
• Rešpektuj štruktúru SOS tréningov (Speed/Strength utorok, Tempo štvrtok, Long nedeľa)
  a aktuálnu fázu plánu (Speed T2–10 / Strength T11–17).
• EASY a DLHÉ behy zadávaj s HR cieľom (hr_min/hr_max z Easy zóny) — NIE tempom!
• TEMPO behy zadávaj na HMP tempo (pace_min/pace_max), prípadne aj s kontrolou tepom.
• INTERVALY (Speed/Strength) zadávaj na tempo (5k resp. 10k), pauzy ako 'recover' pomaly.
• Pre warmup/cooldown použi Easy HR alebo voľné tempo.

Vygeneruj odpoveď VÝLUČNE vo formáte JSON:
{{
  "coach_message": "Komentár a zdôvodnenie pre zverenca po slovensky — spomeň prečo si zvolil dané tepy/tempá.",
  "workouts": [
    {{
      "day_offset": 1,
      "workout_name": "Napr. Easy Run 8km alebo Tempo 6km @ HMP",
      "description": "Popis vrátane účelu (regenerácia / rýchlosť / tempo)",
      "steps": [
        {{ "type": "warmup|run|recover|cooldown", "distance_km": 2.0,
           "hr_min": 130, "hr_max": 142 }},
        {{ "type": "run", "distance_km": 6.0,
           "pace_min": "5:18", "pace_max": "5:10" }}
      ]
    }}
  ]
}}
Pre každý krok použi BUĎ (hr_min+hr_max) ALEBO (pace_min+pace_max) — nie oboje povinne.
Easy/dlhé → HR. Tempo/intervaly → pace. Vraciaš LEN platný JSON."""

    model = genai.GenerativeModel('gemini-2.5-pro')
    response = model.generate_content(system_prompt)

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
    # Garmin API vracia 1 mesiac → načítame aktuálny aj nasledujúci mesiac
    items = []
    for off in range(0, 2):
        yy = now.year + (now.month - 1 + off) // 12
        mm = (now.month - 1 + off) % 12 + 1
        try:
            sched = client.get_scheduled_workouts(yy, mm)
            raw = sched.get('calendarItems', sched.get('workoutScheduledDTOList', [])) if isinstance(sched, dict) else (sched or [])
            items.extend(raw)
        except Exception:
            pass

    # Find all PLANNED workouts from today onwards (nie aktivity/váhy/eventy)
    today_str = datetime.date.today().strftime("%Y-%m-%d")
    upcoming_workouts = [
        item for item in items
        if item.get("date") and item.get("date") >= today_str
        and item.get("itemType") == "workout" and item.get("workoutId")
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
    athlete_context = _gather_athlete_context(client, profile)

    system_prompt = f"""Si špičkový tréner Hanson Half-Marathon Method. Prepočítaj JEDEN naplánovaný
tréning tak, aby presne sedel na AKTUÁLNU fyzičku zverenca (LTHR, HR zóny, VO2max, tempá) a
jeho zvyky. Drž sa Hansonovej metodiky a typu tréningu (Easy/Tempo/Speed/Strength/Long).

Tréning na dátum {target_date_str}: "{old_workout_name}".
Cieľový čas na polmaratón: {profile.get('target_time', 'neuvedený')}
OSOBNÉ POZNÁMKY: {ai_context}
{training_timeline_note(profile)}
{athlete_context}

PRAVIDLÁ:
• Zachovaj typ a účel pôvodného tréningu (ak to bol Easy, ostane Easy; Tempo ostane Tempo...).
• EASY/DLHÉ kroky → HR cieľ (hr_min/hr_max z Easy zóny), NIE tempo.
• TEMPO → HMP tempo (pace). INTERVALY → 5k/10k tempo (pace), pauzy 'recover' pomaly.
• Ak je forma slabá (nízka pripravenosť/HRV), tréning rozumne zmäkči.

Vráť odpoveď VÝLUČNE vo formáte JSON:
{{
  "coach_message": "Ahoj! Upravil som ti tréning podľa aktuálnej fyzičky — vysvetli prečo (po slovensky).",
  "workout": {{
    "workout_name": "{old_workout_name} (Updated)",
    "description": "Prepočítaný tréning podľa LTHR / HR zón.",
    "steps": [
      {{ "type": "warmup", "distance_km": 2.0, "hr_min": 130, "hr_max": 142 }},
      {{ "type": "run", "distance_km": 5.0, "hr_min": 138, "hr_max": 150 }},
      {{ "type": "cooldown", "distance_km": 2.0, "hr_min": 125, "hr_max": 138 }}
    ]
  }}
}}
Pre každý krok BUĎ (hr_min+hr_max) ALEBO (pace_min+pace_max). Easy→HR, Tempo/intervaly→pace."""

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
