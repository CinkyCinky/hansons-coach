import os
import re
import json
import logging
import datetime
from typing import Dict, List, Any, Optional
from google import genai
from google.genai import types
from garminconnect.workout import (
    RunningWorkout, WorkoutSegment, ExecutableStep, RepeatGroup,
    StepType, ConditionType, TargetType
)
from modules import fetcher, hansons_knowledge

logger = logging.getLogger("hansons")

# POZOR: garminconnect.workout.ConditionType.DISTANCE = 1, čo je v Garmin workout-service
# v skutočnosti LAP.BUTTON (manuálne stlačenie)! Reálne ID pre vzdialenosť je 3 — inak sa
# krok uloží bez vzdialenosti a hodinky nevedia, kedy ho ukončiť. Iterations (repeat) = 7.
_COND_DISTANCE_ID = 3
_COND_ITERATIONS_ID = 7


# Generovanie plánov a tréningov beží štandardne na najsilnejšom modeli (Gemini 3.1 Pro).
# Cez ENV GEMINI_MODEL_PLAN sa dá prepnúť na rýchlejší (napr. gemini-3.5-flash) bez zásahu
# do kódu — Pro preview je najpomalšia časť generovania; Flash je citeľne svižnejší.
PLAN_MODEL = os.getenv("GEMINI_MODEL_PLAN", "gemini-3.1-pro-preview")
_gemini_client: Optional[genai.Client] = None


def _get_gemini_client() -> genai.Client:
    """Lenivo vytvorí a cachuje google-genai klienta. Vyžaduje GEMINI_API_KEY."""
    global _gemini_client
    if _gemini_client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise Exception("Gemini API kľúč nie je nastavený.")
        _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


def _generate_json(prompt: str) -> dict:
    """Pošle prompt Gemini a vráti naparsovaný JSON.
    response_mime_type='application/json' vynúti čistý JSON (bez ``` blokov a prózy)."""
    client = _get_gemini_client()
    response = client.models.generate_content(
        model=PLAN_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    text = (response.text or "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise


# ── Čistenie popisu tréningu ──────────────────────────────────────────────────
# Gemini pri dlhšom JSON výstupe (najmä s „thinking“ tokenmi) môže reťazec
# 'description' uťať uprostred slova; structured-output ho potom uzavrie do
# platného JSON, takže sa nahrá neúplná poznámka a v UI sa zobrazí odseknutá
# (napr. „…ktorú využiješ na pre“). Pred zápisom do Garminu popis znormalizujeme
# a odseknutý chvost orežeme späť na poslednú celú vetu.
_DESC_MAX = 480                 # bezpečne pod Garmin limitom poznámky (~512)
_SENT_END = (". ", "! ", "? ", "… ")


def clean_workout_description(text: Optional[str]) -> str:
    """Znormalizuje popis a odstráni odseknutý (truncated) chvost.
    Bezpečné voči bežným popisom — chvost orezáva len pri silnom signáli uťatia
    (dlhý text, ktorý nekončí vetnou interpunkciou) a vždy ponechá aspoň ~40 % textu."""
    if not text:
        return ""
    s = " ".join(str(text).split())
    if not s:
        return ""

    def _last_sentence_end(t: str) -> int:
        return max((t.rfind(p) for p in _SENT_END), default=-1)

    # 1) Tvrdý strop dĺžky (Garmin pole) — orež na poslednú celú vetu pod limitom.
    if len(s) > _DESC_MAX:
        cut = s[:_DESC_MAX]
        b = _last_sentence_end(cut)
        s = (cut[: b + 1] if b >= _DESC_MAX * 0.5 else cut).rstrip()

    # 2) Odseknutý chvost: dlhý popis, ktorý nekončí vetnou interpunkciou ani „)“,
    #    je takmer isto uťatý → vráť ho po poslednú celú vetu (ak je dosť ďaleko).
    if len(s) >= 140 and s[-1] not in ".!?…)\"":
        b = _last_sentence_end(s)
        if b >= len(s) * 0.4:
            s = s[: b + 1].rstrip()
    return s


def _athlete_context_from_wellness(profile: dict, wellness: dict) -> str:
    """Zostaví ten istý AI kontext ako _gather_athlete_context, ale z už načítaného
    (cachnutého) wellness snapshotu — BEZ ďalších Garmin volaní. Šetrí ~5 sekvenčných
    volaní pred každým generovaním plánu/tréningu."""
    blocks = [hansons_knowledge.HANSONS_METHODOLOGY]
    athlete = wellness.get("athlete") or {}
    goal = profile.get("target_time")
    if goal:
        blocks.append(hansons_knowledge.paces_block(goal, athlete.get("vo2max")))
    blocks.append(hansons_knowledge.athlete_block(athlete))
    lthr_data = wellness.get("lthr") or {}
    zones = wellness.get("hr_zones")
    blocks.append(hansons_knowledge.hr_zones_block(
        zones, lthr_data.get("lthr_pace") or athlete.get("lthr_pace")
    ))
    return "".join(b for b in blocks if b)


def _gather_athlete_context(client, profile: dict, wellness: Optional[dict] = None) -> str:
    """Pozbiera živé dáta z Garminu (osobný profil, LTHR, HR zóny) + vypočítané tempá
    a vráti hotový textový blok pre AI prompt. Toto robí trénera 'múdrym'.
    Ak je dodaný `wellness` (cachnutý snapshot), použije ho namiesto živých volaní."""
    if wellness:
        try:
            return _athlete_context_from_wellness(profile, wellness)
        except Exception:
            pass  # nekompletný snapshot → degraduj na živé dáta

    blocks = [hansons_knowledge.HANSONS_METHODOLOGY]

    # Atléta načítaj raz vopred — VO2max potrebujeme pre Speed tempá (aktuálna 5K forma)
    athlete = None
    if client is not None:
        try:
            athlete = fetcher.get_athlete_profile(client)
        except Exception:
            athlete = None

    goal = profile.get("target_time")
    if goal:
        blocks.append(hansons_knowledge.paces_block(goal, (athlete or {}).get("vo2max")))

    if client is not None:
        try:
            blocks.append(hansons_knowledge.athlete_block(athlete))

            lthr_data = fetcher.get_lactate_threshold(client) or {}
            stats = fetcher.get_stats_summary(client) or {}
            # Primárne reálne bežecké zóny z Garminu; fallback výpočet z LTHR/MaxHR
            zones = fetcher.resolve_hr_zones(
                client,
                lthr=lthr_data.get("lthr") or (athlete or {}).get("lthr"),
                max_hr=fetcher.get_max_hr_from_activities(client, days=90),
                resting_hr=stats.get("resting_hr"),
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

def _safe_float(value, default: float = 0.0) -> float:
    """Tolerantný prevod na float — None/''/neplatné → default. Chráni pred pádom uploadu,
    keď AI (alebo úprava v UI) pošle krok s distance_km=null / prázdnym poľom."""
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def create_garmin_step(step_data: dict, step_order: int) -> ExecutableStep:
    """Vytvorí Garmin ExecutableStep zo slovníka od Gemini — podporuje Pace aj HR targety."""
    step_type_map = {
        "warmup":   (StepType.WARMUP,    "warmup",   1),
        "run":      (StepType.INTERVAL,  "interval", 3),
        "recover":  (StepType.RECOVERY,  "recovery", 4),
        "cooldown": (StepType.COOLDOWN,  "cooldown", 2),
    }
    st_id, st_key, st_order = step_type_map.get(step_data.get("type", "run"), step_type_map["run"])

    # Vzdialenosť v metroch (tolerantne — null/''/neplatné → 0, nezhodí celý upload)
    distance_m = _safe_float(step_data.get("distance_km")) * 1000.0

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
                "conditionTypeId": _COND_DISTANCE_ID,
                "conditionTypeKey": "distance",
                "displayOrder": 1,
                "displayable": True,
            },
            endConditionValue=distance_m,
            targetType=target_dict,
        )
        step.targetValueOne = _safe_float(hr_min)
        step.targetValueTwo = _safe_float(hr_max)
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
            "conditionTypeId": _COND_DISTANCE_ID,
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


_DAYS_SK = ["Pondelok", "Utorok", "Streda", "Štvrtok", "Piatok", "Sobota", "Nedeľa"]


def _current_week_dates(today: Optional[datetime.date] = None) -> List[datetime.date]:
    """Zostávajúce dni AKTUÁLNEHO týždňa od dnes po nedeľu (vrátane dneška)."""
    today = today or datetime.date.today()
    days_left = 7 - today.weekday()  # Po=0 → 7 dní (Po–Ne), Ne=6 → 1 (len nedeľa)
    return [today + datetime.timedelta(days=i) for i in range(days_left)]


def _enrich_and_clip_to_week(plan: dict, today: Optional[datetime.date] = None) -> dict:
    """Doplní každému tréningu absolútny dátum + slovenský deň a ZAHODÍ tréningy mimo
    aktuálneho týždňa (day_offset musí byť 0..počet zostávajúcich dní−1)."""
    today = today or datetime.date.today()
    max_offset = len(_current_week_dates(today)) - 1
    kept = []
    for w in plan.get("workouts", []):
        try:
            off = int(w.get("day_offset", 0))
        except (TypeError, ValueError):
            off = 0
        if off < 0 or off > max_offset:
            continue  # mimo aktuálneho týždňa → nezahŕňame
        d = today + datetime.timedelta(days=off)
        w["day_offset"] = off
        w["date"] = d.isoformat()
        w["day_label"] = f"{_DAYS_SK[d.weekday()]} {d.strftime('%d.%m.')}" + (" (dnes)" if off == 0 else "")
        kept.append(w)
    plan["workouts"] = sorted(kept, key=lambda x: x.get("day_offset", 0))
    return plan


# ── Deterministické Hanson guardraily (vynucované v kóde, nie len v prompte) ──────
_HARD_KINDS = {"speed", "strength", "tempo", "long"}      # SOS = tvrdé dni
_KIND_PRIORITY = {"long": 3, "tempo": 2, "strength": 1, "speed": 1}
_HALF_LONG_CAP_KM = 19.5    # ~12 míľ — polmaratónsky strop dlhého behu (NIE 16 mí = maratón)
_JF_LONG_CAP_KM = 16.0      # Just Finish — vrchol dlhého behu ~10 míľ (nižší než Adv/Beg)
_LONG_FRAC = 0.30           # dlhý beh ≤ 30 % týždenného objemu


def classify_workout_kind(name: str) -> str:
    """Python klasifikátor typu behu z názvu — zrkadlí frontend lib/workoutType.ts.
    (TS klasifikátor sa nedá importovať, preto paralelná Py verzia. Poradie je dôležité.)"""
    t = (name or "").lower()
    if re.search(r"strength|sila|silov", t):
        return "strength"
    if re.search(r"speed|rýchl|šprint|interval", t):
        return "speed"
    if re.search(r"tempo", t):
        return "tempo"
    if re.search(r"long|dlh", t):
        return "long"
    if re.search(r"easy|regenerač|rozbeh|klus", t):
        return "easy"
    if re.search(r"rest|voľno|odpočinok", t):
        return "rest"
    return "other"


def _workout_km(w: dict) -> float:
    dist_m, _ = _estimate_steps(w.get("steps", []) or [])
    return dist_m / 1000.0


def _enforce_long_run_cap(workouts: list, notes: list, variant: str = "advanced") -> None:
    """Dlhý beh ≤ strop a ≤ 30 % týždenného objemu (len pri ~plnom týždni — aby sa pri
    oklieštenom zvyšku týždňa neorezal legitímny dlhý beh).
    Strop: Advanced/Beginner ~12 míľ (19.5 km); Just Finish 16 km (~10 mí). Pre Just Finish
    30 % pravidlo NEPLATÍ — vzdialenosti sú verne z knihy a vrchol 16 km je ~31 % objemu
    (T12/14/16), čo by inak guardrail nesprávne orezal."""
    jf = (variant or "advanced").lower() == "just_finish"
    runs = [w for w in workouts if w.get("steps")]
    weekly_km = sum(_workout_km(w) for w in runs)
    near_full_week = len(runs) >= 4
    base_cap = _JF_LONG_CAP_KM if jf else _HALF_LONG_CAP_KM
    for w in workouts:
        if classify_workout_kind(w.get("workout_name", "")) != "long":
            continue
        km = _workout_km(w)
        cap = base_cap
        if near_full_week and weekly_km > 0 and not jf:
            cap = min(cap, _LONG_FRAC * weekly_km)
        if km > cap + 0.1:
            main = max(w.get("steps", []) or [], key=lambda s: s.get("distance_km", 0) or 0,
                       default={})
            new_step = {"type": "run", "distance_km": round(cap, 1)}
            if main.get("pace_min"):
                new_step["pace_min"] = main["pace_min"]
            if main.get("pace_max"):
                new_step["pace_max"] = main["pace_max"]
            w["steps"] = [new_step]
            reason = ("vrchol dlhého behu v Just Finish je ~16 km (10 mí)" if jf else
                      "podľa Hansona dlhý beh nejde nad ~30 % týždenného objemu a na polmaratón nad ~12 míľ")
            notes.append(f"Dlhý beh som skrátil na ~{round(cap, 1)} km — {reason}.")


def _enforce_hard_spacing(workouts: list, easy_fast, easy_slow, notes: list) -> None:
    """Nikdy 2 SOS (tvrdé) dni za sebou — nižšiu prioritu demótuj na Easy beh.
    Priorita: Long > Tempo > Speed/Strength (vyššiu zachovaj)."""
    ws = sorted([w for w in workouts if w.get("day_offset") is not None],
                key=lambda x: int(x.get("day_offset", 0)))
    for i in range(len(ws) - 1):
        a, b = ws[i], ws[i + 1]
        try:
            adjacent = int(b["day_offset"]) - int(a["day_offset"]) == 1
        except (TypeError, ValueError, KeyError):
            adjacent = False
        ka = classify_workout_kind(a.get("workout_name", ""))
        kb = classify_workout_kind(b.get("workout_name", ""))
        if adjacent and ka in _HARD_KINDS and kb in _HARD_KINDS:
            lower = a if _KIND_PRIORITY.get(ka, 0) <= _KIND_PRIORITY.get(kb, 0) else b
            km = max(6.0, min(_workout_km(lower) or 8.0, 12.0))
            old_name = lower.get("workout_name", "Tréning")
            step = {"type": "run", "distance_km": round(km, 1)}
            if easy_fast and easy_slow:
                step["pace_min"] = easy_slow   # pomalší okraj
                step["pace_max"] = easy_fast   # rýchlejší okraj
            lower["steps"] = [step]
            lower["workout_name"] = f"Easy beh {round(km, 1)} km"
            lower["description"] = ("Presunuté na Easy — dva kľúčové tréningy vyšli za sebou. "
                                    "Hanson: medzi tvrdými dňami musí byť regenerácia.")
            notes.append(
                f"„{old_name}“ som zmenil na Easy beh — dva tvrdé tréningy nesmú byť 2 dni za "
                f"sebou (kumulovaná únava potrebuje medzi nimi regeneráciu)."
            )


def apply_plan_guardrails(plan: dict, easy_fast: Optional[str] = None,
                          easy_slow: Optional[str] = None, variant: str = "advanced") -> dict:
    """Deterministické Hanson guardraily na vygenerovaný/upravený plán (mutuje a vráti plan).
    Vynucuje: žiadne 2 tvrdé dni za sebou + strop dlhého behu (variantovo závislý).
    Zmeny zhrnie do coach_message."""
    workouts = plan.get("workouts", []) or []
    notes: list = []
    _enforce_hard_spacing(workouts, easy_fast, easy_slow, notes)
    _enforce_long_run_cap(workouts, notes, variant)
    if notes:
        plan["coach_message"] = ((plan.get("coach_message", "") or "") + "\n\n" + " ".join(notes)).strip()
    return plan


def generate_weekly_plan(profile: dict, constraints: str, client=None, wellness: Optional[dict] = None) -> dict:
    """Vygeneruje plán pre ZVYŠOK aktuálneho týždňa (od dnes po nedeľu) podľa Hanson metódy."""
    target_time = profile.get("target_time", "neuvedený")
    ai_context = profile.get("ai_context", "")
    variant = profile.get("plan_variant", "advanced")
    athlete_context = _gather_athlete_context(client, profile, wellness)
    week_num = hansons_knowledge.current_training_week(profile)

    today = datetime.date.today()
    week_dates = _current_week_dates(today)
    max_offset = len(week_dates) - 1
    # Zoznam dostupných dní tohto týždňa s offsetmi (kotva pre AI, aby nezašiel inam)
    days_list = "\n".join(
        f"  • day_offset {i} = {_DAYS_SK[d.weekday()]} {d.isoformat()}" + (" (DNES)" if i == 0 else "")
        for i, d in enumerate(week_dates)
    )

    system_prompt = f"""Si profesionálny bežecký tréner, špičkový expert na Hanson Half-Marathon Method.
Tvoja úloha je vytvoriť tréningový plán PRESNE podľa Hansonovej metodiky (nižšie) a podľa
REÁLNYCH dát zverenca z Garminu (vek, váha, VO2max, LTHR, HR zóny, tempá).

Cieľový čas na polmaratón: {target_time}.
OSOBNÉ POZNÁMKY K ZVERENCOVI: {ai_context}
{training_timeline_note(profile)}
{hansons_knowledge.variant_note(variant)}
{hansons_knowledge.phase_block(week_num, variant)}
{hansons_knowledge.sos_block(week_num, variant)}
{athlete_context}

Úloha: Vytvor tréningový plán LEN pre ZVYŠOK TOHTO týždňa — od dnes ({today.isoformat()},
{_DAYS_SK[today.weekday()]}) po nedeľu. DNEŠNÝ DEŇ zahrň, ak je medzi dostupnými dňami.
NIKDY nezachádzaj do ďalšieho týždňa (žiadny tréning po najbližšej nedeli).
Dostupné dni (použi PRESNE tieto day_offset, 0 = dnes, max {max_offset} = nedeľa):
{days_list}

AK SI VO FÁZE TAPER (T18): vygeneruj LEN zostupový týždeň — žiadne tvrdé intervaly,
objem dole ~50–60 %, dlhý beh max 8–10 km Easy, max jeden krátky beh s pár HMP úsekmi.
Dodatočná požiadavka zverenca: "{constraints}"
PRÍSNE rešpektuj osobné poznámky (deň odpočinku, čas behu, zranenia) a dostupné dni vyššie.

KĽÚČOVÉ PRAVIDLÁ PRE VÝSTUP:
• Rešpektuj štruktúru SOS tréningov (Speed/Strength utorok, Tempo štvrtok, Long nedeľa)
  a aktuálnu fázu plánu (Speed T2–10 / Strength T11–17). Ak SOS deň v tomto týždni už
  prešiel, presuň ho na najbližší dostupný deň alebo ho v tomto týždni vynechaj.
• VŠETKY behy zadávaj TEMPOM (pace_min/pace_max) — Hanson je pace-first. HR NEpoužívaj ako
  cieľ; orientačný tep daj nanajvýš do textu 'description' (napr. "Easy strop ~150 bpm").
• EASY a DLHÉ behy = JEDEN súvislý beh na Easy tempe, BEZ warmup/cooldown.
• SOS tréningy (Speed/Strength/Tempo) VŽDY začínaj krokom 'warmup' a ukonči 'cooldown',
  každý v rozsahu ~2–4 km (dlhšie sedenie → dlhší WU/CD), na Easy tempe. Hlavná časť medzi nimi.
• TEMPO: hlavná časť na cieľové HMP tempo. STRENGTH: úseky na HMP − 10 s/míľu.
  SPEED: úseky na aktuálne 5k tempo (z VO2max). Pauzy medzi úsekmi = 'recover' pomaly (jog).

Vygeneruj odpoveď VÝLUČNE vo formáte JSON:
{{
  "coach_message": "Komentár a zdôvodnenie pre zverenca po slovensky — spomeň prečo si zvolil dané tepy/tempá.",
  "workouts": [
    {{
      "day_offset": 0,
      "workout_name": "Napr. Easy Run 8km alebo Tempo 6km @ HMP",
      "description": "Krátky popis (1–2 úplné vety, max ~300 znakov) vrátane účelu + orientačný tep ako referencia (napr. Easy strop ~150 bpm)",
      "steps": [
        {{ "type": "warmup", "distance_km": 2.5, "pace_min": "6:20", "pace_max": "5:55" }},
        {{ "type": "run", "distance_km": 6.0, "pace_min": "5:18", "pace_max": "5:10" }},
        {{ "type": "cooldown", "distance_km": 2.5, "pace_min": "6:20", "pace_max": "5:55" }}
      ]
    }}
  ]
}}

INTERVALOVÝ (Speed/Strength) tréning zapíš s 'repeat' krokom — NIE ako N samostatných krokov.
Príklad „6×800m @ 5k, 400m jog pauza" s rozcvičkou/výklusom:
{{
  "day_offset": 1, "workout_name": "Speed 6×800m @ 5k",
  "description": "VO2max/rýchlosť. Úseky na 5k tempo, pauza voľný jog.",
  "steps": [
    {{ "type": "warmup", "distance_km": 2.5, "pace_min": "6:20", "pace_max": "5:55" }},
    {{ "type": "repeat", "iterations": 6, "steps": [
        {{ "type": "run",     "distance_km": 0.8, "pace_min": "4:25", "pace_max": "4:15" }},
        {{ "type": "recover", "distance_km": 0.4, "pace_min": "6:40", "pace_max": "6:10" }}
    ] }},
    {{ "type": "cooldown", "distance_km": 2.5, "pace_min": "6:20", "pace_max": "5:55" }}
  ]
}}
Každý krok zadávaj TEMPOM (pace_min = pomalší okraj, pace_max = rýchlejší okraj v min:sek/km).
HR ako cieľ nepoužívaj. Vraciaš LEN platný JSON."""

    plan = _generate_json(system_prompt)
    plan = _enrich_and_clip_to_week(plan, today)
    # Deterministické guardraily: žiadne 2 tvrdé dni za sebou + strop dlhého behu.
    # Easy tempá z cieľa (nezávisí od VO2max) na prípadné demótovanie SOS → Easy.
    _p = hansons_knowledge.compute_training_paces(target_time) or {}
    return apply_plan_guardrails(plan, _p.get("easy_min"), _p.get("easy_max"), variant)

def generate_single_workout(profile: dict, description: str, client=None,
                            for_date: Optional[str] = None, wellness: Optional[dict] = None) -> dict:
    """Vygeneruje JEDEN tréning podľa požiadavky — s plnou Hanson metodikou + živými
    Garmin dátami (zóny, LTHR, tempá). Všetko TEMPOM (pace); intervaly ako repeat-blok.
    Vráti dict: {workout_name, description, steps:[...]}. Zdieľa create aj modify."""
    target_time = profile.get("target_time", "neuvedený")
    athlete_context = _gather_athlete_context(client, profile, wellness)
    when = f" na dátum {for_date}" if for_date else ""

    prompt = f"""Si špičkový tréner Hanson Half-Marathon Method. Cieľový čas: {target_time}.
{hansons_knowledge.phase_block(hansons_knowledge.current_training_week(profile), profile.get('plan_variant'))}
{athlete_context}

Vygeneruj JEDEN bežecký tréning{when} podľa tejto požiadavky: "{description}"
(Ak je fáza TAPER/T18, drž tréning ľahký a krátky — žiadne tvrdé intervaly.)

PRAVIDLÁ:
• Drž sa Hanson metodiky a typu tréningu (Easy/Tempo/Speed/Strength/Long).
• VŠETKY kroky zadávaj TEMPOM (pace) — Hanson je pace-first. HR ako cieľ nepoužívaj;
  orientačný tep daj nanajvýš do 'description'.
• EASY a DLHÉ behy = JEDEN súvislý beh na Easy tempe, BEZ warmup/cooldown.
• SOS (Speed/Strength/Tempo) VŽDY začni 'warmup' a ukonči 'cooldown', každý ~2–4 km na Easy tempe.
• TEMPO → hlavná časť na cieľové HMP. STRENGTH → HMP − 10 s/míľu. SPEED → aktuálne 5k tempo.
  Pauzy medzi úsekmi = 'recover' pomaly (jog).

Vráť odpoveď VÝLUČNE vo formáte JSON:
{{
  "workout_name": "Napr. Easy Run 8km / Tempo 6km @ HMP",
  "description": "Krátky popis vrátane účelu (+ orientačný tep ako referencia)",
  "steps": [
    {{ "type": "warmup", "distance_km": 2.5, "pace_min": "6:20", "pace_max": "5:55" }},
    {{ "type": "run", "distance_km": 6.0, "pace_min": "5:18", "pace_max": "5:10" }},
    {{ "type": "cooldown", "distance_km": 2.5, "pace_min": "6:20", "pace_max": "5:55" }}
  ]
}}
Intervaly (Speed/Strength) zapíš ako 'repeat' krok s "iterations" a vnorenými "steps"
[run úsek, recover pauza] — NIE ako N samostatných krokov.
Každý krok zadávaj TEMPOM (pace_min = pomalší okraj, pace_max = rýchlejší okraj). Vraciaš LEN platný JSON."""

    return _generate_json(prompt)


def _estimate_steps(steps_json: list) -> tuple[float, float]:
    """Rekurzívne spočíta (vzdialenosť_m, trvanie_s) vrátane repeat-blokov (×iterations)."""
    dist_m, dur_s = 0.0, 0.0
    for s in steps_json or []:
        if s.get("type") == "repeat" and s.get("steps"):
            it = max(1, int(s.get("iterations", 1) or 1))
            d, t = _estimate_steps(s["steps"])
            dist_m += it * d
            dur_s += it * t
        else:
            km = float(s.get("distance_km", 0) or 0)
            dist_m += km * 1000
            ms = pace_to_ms(s.get("pace_max") or s.get("pace_min") or "6:00")
            if ms > 0:
                dur_s += (km * 1000) / ms
    return dist_m, dur_s


def build_garmin_steps(steps_json: list) -> list:
    """Z AI JSON krokov postaví Garmin kroky vrátane repeat-blokov (RepeatGroupDTO).
    Garmin vyžaduje GLOBÁLNE sekvenčné stepOrder naprieč vnorením; kroky v jednom
    repeat-bloku zdieľajú childStepId (id skupiny)."""
    order = [0]   # mutable: globálny stepOrder counter
    group = [0]   # mutable: childStepId counter pre repeat skupiny

    def _walk(items: list, child_id: Optional[int]) -> list:
        result = []
        for s in items or []:
            if s.get("type") == "repeat" and s.get("steps"):
                group[0] += 1
                gid = group[0]
                order[0] += 1
                rg_order = order[0]
                inner = _walk(s["steps"], child_id=gid)
                rg = RepeatGroup(
                    stepOrder=rg_order,
                    stepType={"stepTypeId": StepType.REPEAT, "stepTypeKey": "repeat", "displayOrder": 6},
                    numberOfIterations=max(1, int(s.get("iterations", 1) or 1)),
                    workoutSteps=inner,
                    endCondition={"conditionTypeId": ConditionType.ITERATIONS, "conditionTypeKey": "iterations",
                                  "displayOrder": 7, "displayable": False},
                    endConditionValue=float(max(1, int(s.get("iterations", 1) or 1))),
                )
                rg.childStepId = gid
                result.append(rg)
            else:
                order[0] += 1
                step = create_garmin_step(s, order[0])
                if child_id is not None:
                    step.childStepId = child_id
                result.append(step)
        return result

    return _walk(steps_json, child_id=None)


def build_one_garmin_workout(w: dict) -> "tuple[datetime.date, RunningWorkout]":
    """Postaví JEDEN Garmin tréning z AI workout dict. Pri chybe VYHODÍ výnimku
    (volajúci ju zachytí a zobrazí dôvod používateľovi — nepotláčame ju)."""
    base_date = datetime.date.today()
    # Preferuj absolútny dátum (odolné, ak sa generuje a nahráva v iný deň);
    # fallback na day_offset relatívny k dnešku.
    target_date = None
    if w.get("date"):
        try:
            target_date = datetime.date.fromisoformat(str(w["date"])[:10])
        except ValueError:
            target_date = None
    if target_date is None:
        target_date = base_date + datetime.timedelta(days=int(w.get("day_offset", 0) or 0))

    steps_json = w.get("steps", []) or []
    garmin_steps = build_garmin_steps(steps_json)   # podporuje repeat-bloky
    _, total_duration = _estimate_steps(steps_json)

    segment = WorkoutSegment(
        segmentOrder=1,
        sportType={"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1},
        workoutSteps=garmin_steps,
    )
    garmin_workout = RunningWorkout(
        workoutName=w.get("workout_name", "Beh"),
        description=clean_workout_description(w.get("description", "")),
        estimatedDurationInSecs=int(total_duration),
        workoutSegments=[segment],
    )
    return target_date, garmin_workout


def convert_to_garmin_workouts(ai_plan: dict) -> List[tuple[datetime.date, RunningWorkout]]:
    """Konvertuje AI JSON plán na Garmin objekty (odolne — chybný tréning preskočí)."""
    garmin_workouts = []
    for w in ai_plan.get("workouts", []):
        try:
            garmin_workouts.append(build_one_garmin_workout(w))
        except Exception:
            logger.exception("Preskakujem chybný tréning '%s' pri konverzii", w.get("workout_name"))

    return garmin_workouts

def update_next_workout(client, profile: dict, form_context: str = "",
                        wellness: Optional[dict] = None) -> dict:
    """Prepočíta najbližší tréning podľa aktuálnej formy. form_context = stav dňa
    (pripravenosť/HRV/Body Battery/A:C záťaž) z dashboardu — aby zmäkčenie bolo riadené
    reálnymi dátami, nie len všeobecnou inštrukciou."""
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
    
    ai_context = profile.get("ai_context", "")
    athlete_context = _gather_athlete_context(client, profile, wellness)

    system_prompt = f"""Si špičkový tréner Hanson Half-Marathon Method. Prepočítaj JEDEN naplánovaný
tréning tak, aby presne sedel na AKTUÁLNU fyzičku zverenca (LTHR, HR zóny, VO2max, tempá) a
jeho zvyky. Drž sa Hansonovej metodiky a typu tréningu (Easy/Tempo/Speed/Strength/Long).

Tréning na dátum {target_date_str}: "{old_workout_name}".
Cieľový čas na polmaratón: {profile.get('target_time', 'neuvedený')}
OSOBNÉ POZNÁMKY: {ai_context}
{training_timeline_note(profile)}
{hansons_knowledge.phase_block(hansons_knowledge.current_training_week(profile), profile.get('plan_variant'))}
{athlete_context}
{form_context}

PRAVIDLÁ:
• Zachovaj typ a účel pôvodného tréningu (ak to bol Easy, ostane Easy; Tempo ostane Tempo...).
• ZOHĽADNI STAV DŇA vyššie: ak je pripravenosť/HRV/Body Battery nízke alebo A:C záťaž > 1.4,
  tréning ZMÄKČI (pomalší okraj tempa, menej opakovaní/kratšie úseky, kratší objem). Ak je
  forma výborná, môžeš ostať na predpísanom. Zmenu zdôvodni v coach_message konkrétnymi číslami.
• VŠETKY kroky zadávaj TEMPOM (pace) — Hanson je pace-first. HR ako cieľ nepoužívaj;
  orientačný tep daj nanajvýš do 'description'.
• EASY/DLHÉ behy = JEDEN súvislý beh na Easy tempe, BEZ warmup/cooldown.
• SOS (Speed/Strength/Tempo) VŽDY začni 'warmup' a ukonči 'cooldown', každý ~2–4 km.
• TEMPO → cieľové HMP. STRENGTH → HMP − 10 s/míľu. SPEED → aktuálne 5k tempo. Pauzy 'recover' pomaly.
• Ak je forma slabá (nízka pripravenosť/HRV), tréning rozumne zmäkči (pomalší okraj, kratšie).

Vráť odpoveď VÝLUČNE vo formáte JSON:
{{
  "coach_message": "Ahoj! Upravil som ti tréning podľa aktuálnej fyzičky — vysvetli prečo (po slovensky).",
  "workout": {{
    "workout_name": "{old_workout_name} (Updated)",
    "description": "Prepočítaný tréning podľa aktuálnej formy a tempa (+ orientačný tep).",
    "steps": [
      {{ "type": "warmup", "distance_km": 2.5, "pace_min": "6:20", "pace_max": "5:55" }},
      {{ "type": "run", "distance_km": 5.0, "pace_min": "5:18", "pace_max": "5:10" }},
      {{ "type": "cooldown", "distance_km": 2.5, "pace_min": "6:20", "pace_max": "5:55" }}
    ]
  }}
}}
Každý krok zadávaj TEMPOM (pace_min = pomalší okraj, pace_max = rýchlejší okraj). Vraciaš LEN platný JSON."""

    ai_response = _generate_json(system_prompt)
    new_w_data = ai_response.get("workout")
    
    return {
        "status": "success", 
        "coach_message": ai_response.get("coach_message"),
        "proposed_workout": new_w_data,
        "original_workout": old_workout,
        "old_workout_id": old_workout_id,
        "target_date_str": target_date_str
    }
