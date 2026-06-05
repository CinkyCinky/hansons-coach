"""
modules/workout_builder.py — Konverzia jednoduchého JSON formátu do Garmin API formátu

MÔJ JEDNODUCHÝ FORMÁT (čo ti pošle AI tréner):
{
  "name": "T1-Ut Easy Run",
  "description": "Ľahký beh Z2, HR 129-142 bpm",
  "scheduled_date": "2026-06-09",   # voliteľné
  "sport": "running",               # running (default)
  "steps": [
    {"type": "warmup",   "distance_km": 1.0, "target": "hr",   "hr_min": 116, "hr_max": 129},
    {"type": "run",      "distance_km": 3.5, "target": "hr",   "hr_min": 129, "hr_max": 142},
    {"type": "run",      "duration_min": 30, "target": "open"},
    {"type": "cooldown", "distance_km": 0.5, "target": "open"},
    {
      "type": "repeat", "count": 4,
      "steps": [
        {"type": "interval", "distance_km": 0.8, "target": "hr", "hr_min": 166, "hr_max": 175},
        {"type": "recovery", "distance_km": 0.4, "target": "hr", "hr_min": 116, "hr_max": 135}
      ]
    }
  ]
}

TARGET typy:
  "open"   — žiadny cieľ (beží podľa pocitu)
  "hr"     — srdcový tep (hr_min, hr_max v bpm)
  "pace"   — tempo (pace_min, pace_max napr. "6:30", "7:00")
"""

from typing import Any

# ── Garmin konštanty ──────────────────────────────────────────────────────────

SPORT_TYPES = {
    "running": {"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1},
    "cycling": {"sportTypeId": 2, "sportTypeKey": "cycling", "displayOrder": 2},
    "fitness": {"sportTypeId": 5, "sportTypeKey": "fitness_equipment", "displayOrder": 5},
    "custom":  {"sportTypeId": 6, "sportTypeKey": "custom", "displayOrder": 6},
}

STEP_TYPES = {
    "warmup":   {"stepTypeId": 1, "stepTypeKey": "warmup",   "displayOrder": 1},
    "cooldown": {"stepTypeId": 2, "stepTypeKey": "cooldown",  "displayOrder": 2},
    "interval": {"stepTypeId": 3, "stepTypeKey": "interval",  "displayOrder": 3},
    "recovery": {"stepTypeId": 4, "stepTypeKey": "recovery",  "displayOrder": 4},
    "rest":     {"stepTypeId": 5, "stepTypeKey": "rest",      "displayOrder": 5},
    "run":      {"stepTypeId": 3, "stepTypeKey": "interval",  "displayOrder": 3},  # alias
    "other":    {"stepTypeId": 6, "stepTypeKey": "other",     "displayOrder": 6},
}

END_CONDITIONS = {
    "lap_button": {"conditionTypeId": 1, "conditionTypeKey": "lap.button",  "displayOrder": 1},
    "time":       {"conditionTypeId": 2, "conditionTypeKey": "time",        "displayOrder": 2},
    "distance":   {"conditionTypeId": 3, "conditionTypeKey": "distance",    "displayOrder": 3},
    "iterations": {"conditionTypeId": 7, "conditionTypeKey": "iterations",  "displayOrder": 7},
}

TARGET_TYPES = {
    "open":  {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target",        "displayOrder": 1},
    "hr":    {"workoutTargetTypeId": 4, "workoutTargetTypeKey": "heart.rate.zone",   "displayOrder": 4},
    "pace":  {"workoutTargetTypeId": 6, "workoutTargetTypeKey": "speed",             "displayOrder": 6},
    "cadence": {"workoutTargetTypeId": 3, "workoutTargetTypeKey": "cadence",         "displayOrder": 3},
}


# ── Pomocné funkcie ────────────────────────────────────────────────────────────

def _pace_to_ms(pace_str: str) -> float:
    """Konvertuje tempo "6:30" (min:sec/km) na m/s."""
    parts = pace_str.strip().split(":")
    minutes = int(parts[0])
    seconds = int(parts[1]) if len(parts) > 1 else 0
    total_seconds_per_km = minutes * 60 + seconds
    return round(1000.0 / total_seconds_per_km, 4) if total_seconds_per_km > 0 else 0.0


def _build_target(step_def: dict) -> tuple[dict, Any, Any]:
    """Vráti (target_type, value1, value2) podľa definície kroku."""
    target = step_def.get("target", "open")

    if target == "hr":
        return (
            TARGET_TYPES["hr"],
            float(step_def.get("hr_min", 0)),
            float(step_def.get("hr_max", 220)),
        )
    elif target == "pace":
        # Pre pace: value1 = pomalšie (min), value2 = rýchlejšie (max)
        pace_min = step_def.get("pace_min")  # napr. "7:00" — pomalší koniec
        pace_max = step_def.get("pace_max")  # napr. "6:30" — rýchlejší koniec
        v1 = _pace_to_ms(pace_min) if pace_min else None
        v2 = _pace_to_ms(pace_max) if pace_max else None
        return TARGET_TYPES["pace"], v1, v2
    else:
        return TARGET_TYPES["open"], None, None


def _build_end_condition(step_def: dict) -> tuple[dict, Any]:
    """Vráti (end_condition_type, value) podľa definície kroku."""
    if "distance_km" in step_def:
        return END_CONDITIONS["distance"], float(step_def["distance_km"]) * 1000.0  # na metre
    elif "distance_m" in step_def:
        return END_CONDITIONS["distance"], float(step_def["distance_m"])
    elif "duration_min" in step_def:
        return END_CONDITIONS["time"], float(step_def["duration_min"]) * 60.0  # na sekundy
    elif "duration_sec" in step_def:
        return END_CONDITIONS["time"], float(step_def["duration_sec"])
    else:
        return END_CONDITIONS["lap_button"], None  # manuálne


def _build_executable_step(step_def: dict, step_order: int) -> dict:
    """Zostav jeden vykonateľný krok."""
    step_type_key = step_def.get("type", "run")
    step_type = STEP_TYPES.get(step_type_key, STEP_TYPES["run"])

    end_cond, end_val = _build_end_condition(step_def)
    target_type, target_v1, target_v2 = _build_target(step_def)

    return {
        "type": "ExecutableStepDTO",
        "stepId": None,
        "stepOrder": step_order,
        "childStepId": None,
        "description": step_def.get("description", None),
        "stepType": step_type,
        "endCondition": end_cond,
        "endConditionValue": end_val,
        "endConditionCompare": None,
        "endConditionZone": None,
        "targetType": target_type,
        "targetValueOne": target_v1,
        "targetValueTwo": target_v2,
        "targetValueUnit": None,
        "zoneNumber": None,
        "secondaryTargetType": None,
        "secondaryTargetValueOne": None,
        "secondaryTargetValueTwo": None,
        "secondaryTargetValueUnit": None,
        "secondaryZoneNumber": None,
        "exerciseName": None,
        "exerciseCategory": None,
        "weightValue": None,
        "weightUnit": None,
        "smartRunEnabled": False,
    }


def _build_repeat_group(step_def: dict, step_order: int) -> dict:
    """Zostav opakovací blok (napr. 4× 800m interval)."""
    count = step_def.get("count", 1)
    sub_steps = step_def.get("steps", [])

    garmin_sub_steps = []
    for i, sub in enumerate(sub_steps, start=1):
        garmin_sub_steps.append(_build_executable_step(sub, i))

    return {
        "type": "RepeatGroupDTO",
        "stepId": None,
        "stepOrder": step_order,
        "childStepId": 1,
        "smartRepeat": False,
        "numberOfIterations": count,
        "endCondition": END_CONDITIONS["iterations"],
        "endConditionValue": float(count),
        "workoutSteps": garmin_sub_steps,
    }


# ── Hlavná konverzná funkcia ──────────────────────────────────────────────────

def build_garmin_workout(workout_def: dict) -> dict:
    """
    Konvertuje môj jednoduchý JSON formát do Garmin API formátu.

    Args:
        workout_def: Slovník s definíciou tréningu (môj formát)

    Returns:
        Garmin API workout dict pripravený na nahranie
    """
    name = workout_def.get("name", "Tréning")
    description = workout_def.get("description", "")
    sport_key = workout_def.get("sport", "running")
    sport_type = SPORT_TYPES.get(sport_key, SPORT_TYPES["running"])

    steps = workout_def.get("steps", [])
    garmin_steps = []

    for i, step_def in enumerate(steps, start=1):
        if step_def.get("type") == "repeat":
            garmin_steps.append(_build_repeat_group(step_def, i))
        else:
            garmin_steps.append(_build_executable_step(step_def, i))

    # Odhadni celkovú vzdialenosť
    total_m = _estimate_distance(steps)

    return {
        "workoutId": None,
        "ownerId": None,
        "workoutName": name,
        "description": description,
        "sportType": sport_type,
        "subSportType": None,
        "trainingPlanId": None,
        "author": None,
        "createdDate": None,
        "updatedDate": None,
        "workoutProvider": None,
        "consumerApplicationId": None,
        "atpPlanId": None,
        "estimatedDurationInSecs": None,
        "estimatedDistanceInMeters": None,
        "estimatedDistanceUnit": None,
        "estimateType": None,
        "poolLength": None,
        "poolLengthUnit": None,
        "workoutSegments": [
            {
                "segmentOrder": 1,
                "sportType": sport_type,
                "workoutSteps": garmin_steps,
            }
        ],
    }


def _estimate_distance(steps: list) -> float:
    """Odhadni celkovú vzdialenosť v metroch."""
    total = 0.0
    for step in steps:
        if step.get("type") == "repeat":
            count = step.get("count", 1)
            for sub in step.get("steps", []):
                if "distance_km" in sub:
                    total += sub["distance_km"] * 1000 * count
                elif "distance_m" in sub:
                    total += sub["distance_m"] * count
        else:
            if "distance_km" in step:
                total += step["distance_km"] * 1000
            elif "distance_m" in step:
                total += step["distance_m"]
    return total
