"""
modules/hansons_knowledge.py — Kompletná znalostná báza Hansonovej metódy.

Vydestilované z oficiálneho plánu "Hansons Advanced Half Marathon" (Hansons Coaching
Services, Luke Humphrey) — súbor garmin_tools/hansons_advanced_half_marathon.pdf.

Toto je "mozog" trénera: namiesto 3 riadkov o tempách dostane model kompletnú
filozofiu, štruktúru 18-týždňového plánu, typy tréningov a pravidlá pre HR zóny.
"""

import datetime
from typing import Optional, Dict


# ── Kompletná metodika (vkladá sa do system promptu) ─────────────────────────

HANSONS_METHODOLOGY = """
═══════════════════════════════════════════════════════════════
HANSONS HALF MARATHON METHOD — KOMPLETNÁ METODIKA
(Hansons Coaching Services / Luke Humphrey, Advanced plán)
═══════════════════════════════════════════════════════════════

▌ZÁKLADNÁ FILOZOFIA: KUMULOVANÁ ÚNAVA (Cumulative Fatigue)
Toto je jadro celej metódy. Trénujeme na "unavených nohách", aby si telo zvyklo
bežať v stave čiastočnej únavy — presne ako v závere pretekov. Preto:
• Žiadny tréning sa nerobí naplno oddýchnutý — to je zámer, nie chyba.
• Easy behy NIE SÚ voľno navyše — sú nástroj regenerácie A budovania únavy zároveň.
• Týždenný objem a frekvencia (6 dní/týždeň) sú dôležitejšie než jeden "hrdinský" tréning.
• NIKDY nevynechávaj Easy behy a NIKDY ich nebehaj rýchlo — to je chyba č. 1.

▌TRI "SOS" TRÉNINGY TÝŽDŇA (Something of Substance)
Iba 3 dni v týždni sú náročné. Medzi nimi vždy Easy alebo voľno.
  1. UTOROK  — Speed/Strength (rýchlostné/silové intervaly)
  2. ŠTVRTOK — Tempo beh @ HMP (cieľové pretekové tempo)
  3. NEDEĽA  — Dlhý beh (Long Run)
Pondelok/Streda/Piatok/Sobota = Easy behy alebo Rest/Cross-train.

▌FÁZY 18-TÝŽDŇOVÉHO PLÁNU
• Týždeň 1: Len Easy behy (rozbeh, adaptácia).
• Týždne 2–10: SPEED fáza — krátke intervaly @ 5k–10k tempo (rýchlosť, ekonomika behu).
• Týždne 11–17: STRENGTH fáza — dlhé intervaly @ 10k tempo (sila, odolnosť na HMP).
• Týždeň 18: TAPER (zostup) — výrazné zníženie objemu, sviežosť na preteky.
Tempo behy (štvrtok) prebiehajú PARALELNE celý plán a postupne sa predlžujú.

▌OFICIÁLNY PLÁN — UTORKOVÉ INTERVALY (vždy 1.5 míle WU + 1.5 míle CD)
  SPEED fáza (@ 5k–10k tempo):
   T2:  12 × 400m  (400m jog pauza)
   T3:   8 × 600m  (400m jog pauza)
   T4:   6 × 800m  (400m jog pauza)
   T5:   5 × 1000m (600m jog pauza)
   T6:   4 × 1200m (600m jog pauza)
   T7:   3 × 1míľa (800m jog pauza)
   T8:   5 × 1000m (600m jog pauza)
   T9:   6 × 800m  (400m jog pauza)
   T10: 12 × 400m  (400m jog pauza)
  STRENGTH fáza (@ 10k tempo):
   T11:  6 × 1míľa  (400m jog pauza)
   T12:  4 × 1.5míle (800m jog pauza)
   T13:  3 × 2míle  (800m jog pauza)
   T14:  2 × 3míle  (1míľa jog pauza)
   T15:  3 × 2míle  (800m jog pauza)
   T16:  4 × 1.5míle (800m jog pauza)
   T17:  6 × 1míľa  (400m jog pauza)

▌OFICIÁLNY PLÁN — ŠTVRTKOVÉ TEMPO BEHY @ HMP (cieľové tempo)
  3 míle (T2–T4) → 4 míle (T5–T7) → 5 míľ (T8–T10) → 6 míľ (T11–T13)
  → 7 míľ (T14–T16) → 5 míľ (T17) → taper. Tempo VŽDY presne cieľové HMP.

▌OFICIÁLNY PLÁN — NEDEĽNÉ DLHÉ BEHY
  Budujú sa 10 → 12 → 14 míľ. Dlhý beh NIKDY nepresiahne ~⅓ týždenného objemu.
  Beží sa Easy tempom (NIE pretekovým) — opäť princíp kumulovanej únavy.

▌TRÉNINGOVÉ TEMPÁ (odvodené od cieľového času na polmaratón = HMP)
• Easy:        HMP + 40 až 75 s/km  → REGENERAČNÉ, riadené TEPOM nie tempom (viď nižšie).
• Tempo (HMP): presne cieľové pretekové tempo.
• 10k tempo:   cca HMP − 10 až 15 s/km (Strength intervaly).
• 5k tempo:    cca HMP − 20 až 25 s/km (Speed intervaly).
• Jog pauzy:   veľmi pomaly, klus na odplavenie laktátu.

▌EASY BEHY = RIADENÉ TEPOM, NIE TEMPOM (dôležité!)
Luke Humphrey aj bratia Hansonovci zdôrazňujú: účel Easy behu je REGENERÁCIA a
aeróbna adaptácia — vyplavenie metabolického odpadu a prekrvenie svalov, NIE výkon.
Preto Easy beh riadi SRDCOVÝ TEP, nie tempo:
• Keď je športovec unavený, to isté tempo = vyšší tep = ďalšie poškodenie. Zlé.
• Pri riadení tepom si telo tempo zvolí samo podľa dennej formy → správna regenerácia.
• Easy beh drž v Easy HR zóne (cca 65–80 % LTHR / aeróbne pásmo).
PRETO: Easy a dlhé behy zadávaj s HR cieľom (hr_min/hr_max).
Tempo a intervaly môžu mať tempový cieľ (pace), lebo tam ide o konkrétny výkon —
ideálne však kombináciu tempa a kontroly tepom.

▌AKO ZOHĽADNIŤ ŽIVÉ DÁTA Z GARMINU
• Nízka Pripravenosť / Body Battery / zlé HRV → zmäkči alebo presuň SOS tréning,
  pridaj Easy, varuj pred preťažením. Kumulovaná únava ÁNO, zranenie NIE.
• Vysoký pomer akútna/chronická záťaž (>1.4) → riziko preťaženia, uber.
• Zhodnoť reálne odbehnuté tempá/tepy z histórie — ak HMP cieľ nesedí s formou
  (VO2max, tempá na intervaloch), navrhni úpravu cieľa.
• Easy HR zóny počítaj z aktuálneho LTHR / Max HR — nech športovec nebehá zbytočne
  pomaly ani príliš rýchlo.
"""


# ── Výpočet tréningových tempov z cieľového času ─────────────────────────────

def _parse_goal_to_sec(goal_time: str) -> Optional[int]:
    """'1:50:00' alebo '1:50' → celkový čas v sekundách."""
    try:
        parts = [int(x) for x in str(goal_time).strip().split(":")]
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        if len(parts) == 2:
            return parts[0] * 3600 + parts[1] * 60  # h:mm
    except Exception:
        pass
    return None


def _fmt(pace_sec: int) -> str:
    return f"{pace_sec // 60}:{pace_sec % 60:02d}"


def compute_training_paces(goal_time: str) -> Optional[Dict[str, str]]:
    """Z cieľového času na polmaratón (21.0975 km) vypočíta všetky Hanson tempá (s/km)."""
    total = _parse_goal_to_sec(goal_time)
    if not total:
        return None
    hmp = round(total / 21.0975)  # Half Marathon Pace v s/km
    return {
        "hmp": _fmt(hmp),
        "easy_min": _fmt(hmp + 40),   # rýchlejší okraj Easy
        "easy_max": _fmt(hmp + 75),   # pomalší okraj Easy
        "tempo": _fmt(hmp),           # tempo beh = HMP
        "pace_10k": _fmt(hmp - 12),   # Strength intervaly
        "pace_5k": _fmt(hmp - 22),    # Speed intervaly
        "hmp_sec": hmp,
    }


def paces_block(goal_time: str) -> str:
    """Formátovaný blok s vypočítanými tempami pre vloženie do promptu."""
    p = compute_training_paces(goal_time)
    if not p:
        return ""
    return (
        f"\nVYPOČÍTANÉ TEMPÁ (cieľ {goal_time}):\n"
        f"  HMP (pretekové/tempo): {p['hmp']}/km\n"
        f"  Easy:  {p['easy_min']}–{p['easy_max']}/km (ale RIAĎ TEPOM, nie tempom!)\n"
        f"  10k (Strength int.):   {p['pace_10k']}/km\n"
        f"  5k (Speed int.):       {p['pace_5k']}/km\n"
    )


# ── Profil športovca + HR zóny do promptu ────────────────────────────────────

def athlete_block(athlete: Optional[dict]) -> str:
    """Formátuje osobné dáta z Garmin účtu (vek/váha/výška/VO2max/LTHR)."""
    if not athlete:
        return ""
    parts = ["\nOSOBNÉ DÁTA ŠPORTOVCA (z Garmin účtu):"]
    if athlete.get("age"):       parts.append(f"  Vek: {athlete['age']} r.")
    if athlete.get("gender"):    parts.append(f"  Pohlavie: {athlete['gender']}")
    if athlete.get("height_cm"): parts.append(f"  Výška: {athlete['height_cm']} cm")
    if athlete.get("weight_kg"): parts.append(f"  Váha: {athlete['weight_kg']} kg")
    if athlete.get("vo2max"):    parts.append(f"  VO2max: {athlete['vo2max']} ml/kg/min")
    if athlete.get("lthr"):      parts.append(f"  LTHR: {athlete['lthr']} bpm")
    if athlete.get("lthr_pace"): parts.append(f"  LT tempo: {athlete['lthr_pace']}")
    return "\n".join(parts) + "\n"


def hr_zones_block(hr_zones: Optional[dict], lthr_pace: Optional[str] = None) -> str:
    """Formátuje HR zóny pre prompt. Ak ide o reálne Garmin zóny, zobrazí aj surové Z1–Z5."""
    if not hr_zones:
        return ""
    src = hr_zones.get("source", "")
    bits = []
    if hr_zones.get("lthr"):     bits.append(f"LTHR={hr_zones['lthr']} bpm")
    if hr_zones.get("max_hr"):   bits.append(f"MaxHR={hr_zones['max_hr']} bpm")
    if hr_zones.get("resting_hr"): bits.append(f"pokoj={hr_zones['resting_hr']} bpm")
    base = ", ".join(bits)

    out = f"\nHR ZÓNY (zdroj: {src}; {base}):\n"

    # Surové Garmin zóny ak sú k dispozícii
    raw = hr_zones.get("zones")
    if raw:
        out += "  Garmin zóny:\n"
        for k in ("z1", "z2", "z3", "z4", "z5"):
            if raw.get(k):
                out += f"    {k.upper()}: {raw[k][0]}–{raw[k][1]} bpm\n"

    out += (
        "  Hanson mapovanie:\n"
        f"    Easy/Dlhé:  {hr_zones['easy'][0]}–{hr_zones['easy'][1]} bpm  ← Easy VŽDY sem\n"
        f"    Moderate:   {hr_zones['moderate'][0]}–{hr_zones['moderate'][1]} bpm\n"
        f"    Tempo/HMP:  {hr_zones['tempo'][0]}–{hr_zones['tempo'][1]} bpm\n"
        f"    Threshold:  {hr_zones['threshold'][0]}–{hr_zones['threshold'][1]} bpm\n"
        f"    Speed:      {hr_zones['speed'][0]}–{hr_zones['speed'][1]} bpm\n"
    )
    if lthr_pace:
        out += f"  LT tempo (referencia): {lthr_pace}\n"
    return out
