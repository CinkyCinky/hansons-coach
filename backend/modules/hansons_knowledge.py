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

▌OFICIÁLNY PLÁN — UTORKOVÉ INTERVALY (WU + CD 2–4 km na Easy tempe)
  SPEED fáza (@ AKTUÁLNE 5k tempo — z reálnej formy/VO2max, NIE z cieľa):
   T2:  12 × 400m  (400m jog pauza)
   T3:   8 × 600m  (400m jog pauza)
   T4:   6 × 800m  (400m jog pauza)
   T5:   5 × 1000m (600m jog pauza)
   T6:   4 × 1200m (600m jog pauza)
   T7:   3 × 1.6 km (800m jog pauza)
   T8:   5 × 1000m (600m jog pauza)
   T9:   6 × 800m  (400m jog pauza)
   T10: 12 × 400m  (400m jog pauza)
  STRENGTH fáza (@ cieľové HMP − 6 s/km):
   T11:  6 × 1.6 km  (400m jog pauza)
   T12:  4 × 2.4 km  (800m jog pauza)
   T13:  3 × 3.2 km  (800m jog pauza)
   T14:  2 × 4.8 km  (1.6 km jog pauza)
   T15:  3 × 3.2 km  (800m jog pauza)
   T16:  4 × 2.4 km  (800m jog pauza)
   T17:  6 × 1.6 km  (400m jog pauza)

▌OFICIÁLNY PLÁN — ŠTVRTKOVÉ TEMPO BEHY @ HMP (cieľové tempo)
  5 km (T2–T4) → 6.5 km (T5–T7) → 8 km (T8–T10) → 10 km (T11–T13)
  → 11 km (T14–T16) → 8 km (T17) → taper. Tempo VŽDY presne cieľové HMP.

▌OFICIÁLNY PLÁN — NEDEĽNÉ DLHÉ BEHY
  Budujú sa ~13 → 16 → 19 km (vrchol ~19 km; ku koncu striedanie 16/19).
  Dlhý beh NIKDY nepresiahne ~30 % týždenného objemu. POZOR: ~26 km je MARATÓNsky
  strop, NIE polmaratónsky — pri polmaratóne dlhý beh nejde nad ~19 km.
  Beží sa Easy tempom (NIE pretekovým) — opäť princíp kumulovanej únavy.

▌TRÉNINGOVÉ TEMPÁ (Hanson je PACE-FIRST — riadime TEMPOM, nie tepom)
• Easy:      HMP + 40 až 75 s/km  → REGENERAČNÉ, riadené TEMPOM (tep len referencia).
• Tempo:     presne cieľové pretekové HMP.
• Strength:  cieľové HMP − 6 s/km — dlhé intervaly v 2. polovici plánu.
• Speed:     AKTUÁLNE 5k tempo z reálnej formy (VO2max / posledné preteky), NIE z cieľa.
• Jog pauzy: veľmi pomaly, klus na odplavenie laktátu.

▌EASY BEHY = RIADENÉ TEMPOM (Hanson), tep je len doplnková referencia
Luke Humphrey je voči tréningu podľa tepu skeptický — metóda predpisuje TEMPO, nie tep
(„keď budú rozdávať kvalifikácie na Boston podľa tepu, začnem trénovať podľa tepu").
Dôvody, prečo NIE tep ako cieľ počas behu:
• Cardiac drift — pri rovnakom Easy tempe tep v 2. polovici behu stúpa (teplo/únava);
  HR cieľ by ťa zbytočne brzdil, hoci bežíš správne.
• Oneskorenie a denná variabilita HR robia z HR cieľa nervózny, nepresný nástroj.
Easy účel = REGENERÁCIA + aeróbna adaptácia: práve preto bež na Easy TEMPE (HMP+40–75 s/km),
nie príliš rýchlo (chyba č. 1). Easy tempo má rozsah → v zlý/horúci deň bež pomalší okraj.

▌TEP AKO REFERENCIA (nie cieľ): orientačný strop ≈ AERÓBNY PRAH (AeT)
Ak chceš tep ako kontrolu, drž ho pod aeróbnym prahom (AeT ≈ 0.86 × LTHR; napr. LTHR 175 →
~150 bpm). Slúži ako poistka „nebežím Easy príliš rýchlo" a na detekciu preťaženia
(ranný pokoj/HRV), NIE ako riadiaci target tréningu.
PRETO: Easy, Dlhé, Tempo aj intervaly zadávaj s TEMPOVÝM cieľom (pace). HR strop uveď
nanajvýš ako informáciu v popise kroku, nie ako Garmin target.

▌DLHÝ BEH — PRAVIDLO OBJEMU (dôležitý guardrail)
• Dlhý beh NIKDY nepresiahne ~30 % týždenného objemu. Radšej kratší a častejší
  beh než jeden „hrdinský". Polmaratónsky dlhý beh vrcholí na ~19 km.
  (Strop ~26 km je MARATÓNske pravidlo — na polmaratón sa NEvzťahuje.)
• Dlhý beh sa beží EASY tempom/tepom (nie pretekovým) — opäť kumulovaná únava.

▌ROZLOŽENIE INTENZITY A OBJEMU
• 6 dní behu + 1 deň úplný odpočinok alebo cross-train (bike, plávanie, sila, joga).
• VÄČŠINA objemu je Easy — Easy behy tvoria ~50 %+ vrcholového týždenného objemu.
  Easy dni VŽDY oddeľujú SOS tréningy (nikdy 2 tvrdé dni za sebou).
• Hanson beží o niečo „tvrdšie" než striktné 80/20, ale princíp platí: kvalita je
  v 3 SOS, zvyšok ľahko. Objem a konzistencia > jednorazové hrdinstvo.

▌PRESNOSŤ TEMPA — „NERETEKUJ TRÉNINGY"
• Drž predpísané TEMPÁ presne. Bežať Easy príliš rýchlo je chyba č. 1 (ruší
  regeneráciu). Bežať SOS rýchlejšie než treba tiež škodí — vyčerpá pred ďalším SOS.
• Speed intervaly kotvi na AKTUÁLNU 5k formu (nie cieľ) — podľa reálnej fyzičky
  (VO2max, posledné preteky/tempá). Strength a Tempo kotvi na CIEĽOVÝ čas (HMP).
• Quality session (SOS) = warm-up + cool-down v rozsahu 2–4 km, na Easy tempe;
  dlhšie sedenie → dlhší WU/CD. Easy a Dlhé behy WU/CD NEMAJÚ.

▌ÚPRAVA NA PODMIENKY
• Teplo / kopce / vietor → bež podľa ÚSILIA (tepu), nie tempa; tempo pusť pomalšie.
• Spánok a výživa sú súčasť tréningu — kumulovaná únava vyžaduje kvalitnú regeneráciu
  (dostatok spánku, sacharidy okolo SOS, hydratácia, fueling na dlhých behoch).

▌AKO ZOHĽADNIŤ ŽIVÉ DÁTA Z GARMINU
• Nízka Pripravenosť / Body Battery / zlé HRV → zmäkči alebo presuň SOS tréning,
  pridaj Easy, varuj pred preťažením. Kumulovaná únava ÁNO, zranenie NIE.
• Vysoký pomer akútna/chronická záťaž (>1.4) → riziko preťaženia, uber.
• Zhodnoť reálne odbehnuté tempá z histórie — ak HMP cieľ nesedí s formou
  (VO2max, tempá na intervaloch), navrhni úpravu cieľa.
• Speed tempo odvoď z aktuálneho VO2max (5K forma). Tep (LTHR) slúži len ako referenčný
  strop pre Easy a na detekciu preťaženia — nie ako riadiaci cieľ tréningu.
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


def estimate_5k_pace_sec(vo2max: Optional[float]) -> Optional[int]:
    """Odhad AKTUÁLNEHO 5K tempa (s/km) z VO2max (Garmin) pre Speed intervaly.
    vVO2max z inverznej ACSM rovnice; 5K sa beží ~na vVO2max (mierne konzervatívne →
    radšej o čosi pomalšie = bezpečnejšie intervaly). Je to ODHAD, nie meranie."""
    try:
        v = float(vo2max)
    except (TypeError, ValueError):
        return None
    if v <= 3.5:
        return None
    v_vo2max_m_min = (v - 3.5) / 0.2     # rýchlosť pri VO2max (m/min), ACSM inverz
    v_5k_m_s = v_vo2max_m_min / 60.0     # ~100 % vVO2max ≈ 3–5K pretekové tempo
    if v_5k_m_s <= 0:
        return None
    return round(1000.0 / v_5k_m_s)


def compute_training_paces(goal_time: str, vo2max: Optional[float] = None) -> Optional[Dict[str, str]]:
    """Hanson polmaratónové tempá (s/km). Strength a Tempo z cieľa, Speed z AKTUÁLNEJ
    formy (VO2max). Easy je tempové pásmo (riadené tempom, nie tepom).

    POZOR: tieto vzorce ZRKADLÍ frontend v `frontend/lib/paces.ts` (živá kalkulačka
    v Nastaveniach). Pri zmene vzorca (napr. Easy pásmo, Strength −6 s/km) uprav OBE miesta,
    inak sa UI náhľad rozíde s reálne vygenerovaným plánom."""
    total = _parse_goal_to_sec(goal_time)
    if not total:
        return None
    hmp = round(total / 21.0975)            # Half Marathon Pace (s/km) = Tempo
    strength = hmp - 6                       # Strength = HMP − 10 s/míľu (≈ −6 s/km)

    # Speed = aktuálne 5K tempo z VO2max; fallback z cieľa, ak VO2max chýba
    speed = estimate_5k_pace_sec(vo2max)
    speed_source = "VO2max"
    if not speed:
        speed = hmp - 22
        speed_source = "cieľ (fallback)"
    # Sanity: Speed musí byť rýchlejší než Strength (a ten než Tempo/HMP)
    speed = min(speed, strength - 5)

    return {
        "hmp": _fmt(hmp),
        "easy_min": _fmt(hmp + 40),          # rýchlejší okraj Easy
        "easy_max": _fmt(hmp + 75),          # pomalší okraj Easy
        "tempo": _fmt(hmp),                  # Tempo beh = HMP
        "strength": _fmt(strength),          # Strength intervaly
        "speed": _fmt(speed),                # Speed intervaly
        "speed_source": speed_source,
        "hmp_sec": hmp,
    }


def paces_block(goal_time: str, vo2max: Optional[float] = None) -> str:
    """Formátovaný blok s vypočítanými tempami pre vloženie do promptu."""
    p = compute_training_paces(goal_time, vo2max)
    if not p:
        return ""
    return (
        f"\nVYPOČÍTANÉ TEMPÁ (cieľ {goal_time}):\n"
        f"  HMP (pretekové = Tempo beh): {p['hmp']}/km\n"
        f"  Easy/Dlhé: {p['easy_min']}–{p['easy_max']}/km — RIAĎ TEMPOM (tep len ako referencia)\n"
        f"  Strength intervaly: {p['strength']}/km (cieľ HMP − 6 s/km)\n"
        f"  Speed intervaly:    {p['speed']}/km (aktuálna 5K forma; zdroj: {p['speed_source']})\n"
    )


# ── Predikcia pretekového času (na odhad realistického cieľa) ────────────────

HALF_KM = 21.0975


def riegel_predict_sec(known_dist_km: float, known_time_sec: float,
                       target_dist_km: float = HALF_KM) -> Optional[int]:
    """Riegelov vzorec T2 = T1 × (D2/D1)^1.06 — predpoveď času na inú vzdialenosť."""
    try:
        if known_dist_km <= 0 or known_time_sec <= 0 or target_dist_km <= 0:
            return None
        return round(known_time_sec * (target_dist_km / known_dist_km) ** 1.06)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def predict_half_from_vo2max(vo2max: Optional[float]) -> Optional[int]:
    """Odhad polmaratónového času (s) z VO2max — cez 5K tempo (ACSM) + Riegel.
    ACSM je mierne konzervatívny → odhad je radšej o čosi pomalší (bezpečnejší cieľ)."""
    p5 = estimate_5k_pace_sec(vo2max)   # s/km na 5K
    if not p5:
        return None
    return riegel_predict_sec(5.0, p5 * 5.0, HALF_KM)


def fmt_hms(total_sec: Optional[int]) -> Optional[str]:
    """Sekundy → 'H:MM:SS'."""
    if not total_sec or total_sec <= 0:
        return None
    total_sec = int(total_sec)
    return f"{total_sec // 3600}:{(total_sec % 3600) // 60:02d}:{total_sec % 60:02d}"


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


# ── Fáza prípravy (RAMP / SPEED / STRENGTH / TAPER) ──────────────────────────

TAPER_GUIDANCE = (
    "PRETEKOVÝ TÝŽDEŇ / TAPER (T18): toto je zostupový týždeň — cieľom je SVIEŽOSŤ, nie fitness.\n"
    "• Výrazne zníž objem (cca 50–60 % oproti vrcholu), ale ZACHOVAJ frekvenciu a trochu HMP tempa.\n"
    "• ŽIADNE nové vzdialenosti, žiadne tvrdé intervaly. Max 1 krátky beh s pár úsekmi v HMP na 'ostrosť'.\n"
    "• Dlhý beh skráť (max ~8–10 km) a bež ho Easy.\n"
    "• Priorita: spánok, sacharidy, hydratácia, ľahké rozklusanie deň pred pretekmi.\n"
    "• Je normálne cítiť 'ťažké nohy' a nervozitu — to taper, nie strata formy. Upokoj zverenca."
)


def current_training_week(profile: dict) -> int:
    """Aktuálny týždeň prípravy (1–18) z training_start_date.

    Týždeň sa mení vždy v PONDELOK (ISO), nezávisle od toho, na ktorý deň padne
    training_start_date. Automatický štart = dátum_pretekov − 126 dní, čo pri
    nedeľných pretekoch padne na nedeľu — bez tohto zarovnania by sa týždeň menil
    v nedeľu. Kotvou T1 je preto pondelok v dni štartu alebo prvý nasledujúci.
    """
    try:
        start = datetime.date.fromisoformat(str(profile.get("training_start_date", "2026-06-01"))[:10])
        today = datetime.date.today()
        anchor_monday = start + datetime.timedelta(days=(7 - start.weekday()) % 7)  # pondelok ≥ štart
        today_monday = today - datetime.timedelta(days=today.weekday())             # pondelok tohto týždňa
        week = (today_monday - anchor_monday).days // 7 + 1
        return max(1, min(18, week))
    except Exception:
        return 1


def training_phase(week: int, variant: Optional[str] = "advanced") -> Dict[str, str]:
    """Mapuje aktuálny týždeň prípravy (1–18) na Hanson fázu + krátky pokyn pre trénera.
    Pri variante 'just_finish' fázy NEMAJÚ speed/tempo — len Easy behy + nedeľný dlhý beh."""
    if week <= 1:
        return {"key": "intro", "label": "Úvod (T1)",
                "note": "Úvodný týždeň — len Easy behy, adaptácia. Žiadne SOS tréningy."}
    if (variant or "advanced").lower() == "just_finish":
        if week <= 17:
            return {"key": "just_finish", "label": f"Just Finish (T{week})",
                    "note": "JUST FINISH — ŽIADNE intervaly ani tempo. Len Easy behy + nedeľný dlhý beh "
                            "(Easy). Cieľ je v pohode dobehnúť: rozhoduje objem a konzistencia, nie rýchlosť."}
        return {"key": "taper", "label": "Taper / pretekový týždeň (T18)", "note": TAPER_GUIDANCE}
    if (variant or "advanced").lower() == "beginner":
        if week <= 5:
            return {"key": "base", "label": f"Základná fáza (T{week})",
                    "note": "BASE (Beginner) — budovanie objemu: len Easy behy + nedeľný dlhý beh. "
                            "Žiadne intervaly ani tempo, tie začínajú až T6. SOS: Dlhý (ne)."}
        if week <= 10:
            return {"key": "speed", "label": f"Speed fáza (T{week})",
                    "note": "SPEED fáza — krátke intervaly @ aktuálne 5k tempo (z VO2max). SOS: Speed (ut), Tempo (št), Dlhý (ne)."}
        if week <= 17:
            return {"key": "strength", "label": f"Strength fáza (T{week})",
                    "note": "STRENGTH fáza — dlhé intervaly @ HMP − 6 s/km. SOS: Strength (ut), Tempo (št), Dlhý (ne)."}
        return {"key": "taper", "label": "Taper / pretekový týždeň (T18)", "note": TAPER_GUIDANCE}
    if week <= 10:
        return {"key": "speed", "label": f"Speed fáza (T{week})",
                "note": "SPEED fáza — krátke intervaly @ aktuálne 5k tempo (z VO2max). SOS: Speed (ut), Tempo (št), Dlhý (ne)."}
    if week <= 17:
        return {"key": "strength", "label": f"Strength fáza (T{week})",
                "note": "STRENGTH fáza — dlhé intervaly @ HMP − 6 s/km. SOS: Strength (ut), Tempo (št), Dlhý (ne)."}
    return {"key": "taper", "label": "Taper / pretekový týždeň (T18)", "note": TAPER_GUIDANCE}


def phase_block(week: int, variant: Optional[str] = "advanced") -> str:
    """Formátovaný blok o aktuálnej fáze prípravy pre prompt."""
    ph = training_phase(week, variant)
    return f"\nFÁZA PRÍPRAVY: {ph['label']} (týždeň {week}/18)\n{ph['note']}\n"


# ── Štruktúrované SOS progresie (Advanced plán) ──────────────────────────────
# Hodnoty: (počet_opakovaní, dĺžka_úseku_m, dĺžka_pauzy_m). Pauza = pomalý jog.
SPEED_LADDER = {
    2: (12, 400, 400), 3: (8, 600, 400), 4: (6, 800, 400), 5: (5, 1000, 600),
    6: (4, 1200, 600), 7: (3, 1609, 800), 8: (5, 1000, 600), 9: (6, 800, 400),
    10: (12, 400, 400),
}
STRENGTH_LADDER = {
    11: (6, 1609, 400), 12: (4, 2414, 800), 13: (3, 3219, 800), 14: (2, 4828, 1609),
    15: (3, 3219, 800), 16: (4, 2414, 800), 17: (6, 1609, 400),
}
# Tempo beh (štvrtok) @ HMP — dĺžka v míľach podľa týždňa
TEMPO_MILES = {2: 3, 3: 3, 4: 3, 5: 4, 6: 4, 7: 4, 8: 5, 9: 5, 10: 5,
               11: 6, 12: 6, 13: 6, 14: 7, 15: 7, 16: 7, 17: 5}
_MI = 1.609

# ── Beginner (Program pre začiatočníkov) — Tabuľka 4.1 z knihy ────────────────
# Kľúčový rozdiel oproti Advanced: BASE fáza T1–5 (len Easy + nedeľný dlhý beh),
# intervaly AJ tempo štartujú až T6 (~13 týždňov pred pretekmi). Overené z knihy aj
# oficiálnych Hansons zdrojov. Speed rebrík = Advanced T2–6 posunutý na T6–10;
# Strength je zhodný s Advanced okrem T17 (Beginner 4×1mí, Advanced 6×1mí).
SPEED_LADDER_BEGINNER = {
    6: (12, 400, 400), 7: (8, 600, 400), 8: (6, 800, 400),
    9: (5, 1000, 600), 10: (4, 1200, 600),
}
STRENGTH_LADDER_BEGINNER = {**STRENGTH_LADDER, 17: (4, 1609, 400)}
TEMPO_MILES_BEGINNER = {6: 4, 7: 4, 8: 5, 9: 5, 10: 5,
                        11: 6, 12: 6, 13: 6, 14: 7, 15: 7, 16: 7, 17: 5}


# ── Just Finish (Program pre nenáročných) — VERNÁ tabuľka z knihy ─────────────
# Hansons Half-Marathon Method, „Just Finish / Program pro nenáročné" (Tabulka 4.4,
# str. 120–123). Overené z knihy + krížovo cez oficiálne Hansons zdroje (knižné km =
# zaokrúhlené míle: 2mí→3, 3→5, 4→6.5, 5→8, 6→10, 7→11, 8→13, 10→16 km).
# Na rozdiel od Advanced/Beginner: ŽIADNY speed ani tempo — len Easy behy + nedeľný
# dlhý beh (Easy). Hodnoty = km na deň; chýbajúci deň = voľno. Streda je vždy voľno.
JUST_FINISH_KM: Dict[int, Dict[str, object]] = {
    1:  {"tue": 3,   "thu": 3,                                       "sun": 5},
    2:  {"tue": 3,   "thu": 3,              "sat": 3,                 "sun": 5},
    3:  {"tue": 5,   "thu": 5,              "sat": 5,                 "sun": 6.5},
    4:  {"tue": 5,   "thu": 5,   "fri": 3,  "sat": 5,                 "sun": 8},
    5:  {"tue": 5,   "thu": 6.5, "fri": 3,  "sat": 5,                 "sun": 10},
    6:  {"mon": 3,   "tue": 5,   "thu": 6.5, "fri": 3, "sat": 5,      "sun": 10},
    7:  {"mon": 5,   "tue": 5,   "thu": 6.5, "fri": 5, "sat": 5,      "sun": 11},
    8:  {"mon": 5,   "tue": 6.5, "thu": 6.5, "fri": 5, "sat": 5,      "sun": 13},
    9:  {"mon": 5,   "tue": 8,   "thu": 8,  "fri": 5,  "sat": 5,      "sun": 10},
    10: {"mon": 5,   "tue": 8,   "thu": 8,  "fri": 5,  "sat": 6.5,    "sun": 13},
    11: {"mon": 6.5, "tue": 8,   "thu": 8,  "fri": 6.5, "sat": 6.5,   "sun": 10},
    12: {"mon": 5,   "tue": 8,   "thu": 8,  "fri": 6.5, "sat": 8,     "sun": 16},
    13: {"mon": 6.5, "tue": 8,   "thu": 8,  "fri": 5,  "sat": 10,     "sun": 13},
    14: {"mon": 5,   "tue": 8,   "thu": 8,  "fri": 6.5, "sat": 8,     "sun": 16},
    15: {"mon": 6.5, "tue": 8,   "thu": 8,  "fri": 5,  "sat": 10,     "sun": 13},
    16: {"mon": 6.5, "tue": 8,   "thu": 8,  "fri": 6.5, "sat": 8,     "sun": 16},
    17: {"mon": 6.5, "tue": 6.5, "thu": 6.5, "fri": 5, "sat": 5,      "sun": 10},
    18: {"mon": 5,   "tue": 6.5, "thu": 5,  "fri": 5,  "sat": 5,      "sun": "race"},
}
# Pozn.: vrchol dlhého behu v Just Finish = 16 km (~10 mí); strop sa vynucuje v
# workout_generator._JF_LONG_CAP_KM (tam, kde žijú ostatné guardrail stropy).

_DAY_SK_FULL = {"mon": "Pondelok", "tue": "Utorok", "wed": "Streda", "thu": "Štvrtok",
                "fri": "Piatok", "sat": "Sobota", "sun": "Nedeľa"}


def _fmt_reps(reps: int, dist_m: int, rec_m: int) -> str:
    def _d(m):
        return f"{m} m" if m < 1000 else f"{round(m/1000, 1)} km"
    return f"{reps}×{_d(dist_m)} (pauza {_d(rec_m)} jog)"


VARIANTS = {
    "advanced": "Advanced — plný objem (~82 km/týž vo vrchole), 6 dní behu.",
    "beginner": "Beginner — nižší objem (~77 km/týž vo vrchole), kratšie Easy behy. BASE fáza T1–5 (len Easy + nedeľný dlhý beh); intervaly AJ tempo štartujú až T6. Strength ako Advanced okrem T17 (Beginner 4×1.6 km).",
    "just_finish": "Just Finish — cieľ je dobehnúť (HMP 2:25+): ŽIADNE intervaly ani tempo, len Easy behy + nedeľný dlhý beh (vrchol ~16 km, objem ~53 km vo vrchole).",
}


def variant_label(variant: Optional[str]) -> str:
    return {"advanced": "Advanced", "beginner": "Beginner", "just_finish": "Just Finish"}.get(
        (variant or "advanced").lower(), "Advanced")


def variant_note(variant: Optional[str]) -> str:
    v = (variant or "advanced").lower()
    return f"\nVARIANT PLÁNU: {VARIANTS.get(v, VARIANTS['advanced'])}\n"


# Garmin „Training Readiness" úroveň (HIGH, LOW…) → SK, aby ju AI tréner nezopakoval anglicky.
_READINESS_LEVEL_SK = {
    "VERY_LOW": "veľmi nízka", "LOW": "nízka", "MODERATE": "stredná", "HIGH": "vysoká",
    "VERY_HIGH": "veľmi vysoká", "MAXED": "maximálna", "PRIME": "špičková",
    "READY": "pripravený", "NONE": "--", "UNKNOWN": "--",
}


def readiness_level_sk(level) -> str:
    """Garmin readiness level (anglicky) → slovensky. Neznámy necháme tak."""
    if not level:
        return ""
    return _READINESS_LEVEL_SK.get(str(level).strip().upper(), str(level))


def sos_for_week(week: int, variant: Optional[str] = "advanced") -> Optional[dict]:
    """Predpísané SOS tréningy pre daný týždeň. Vráti štruktúru pre prompt aj pre prípadný
    deterministický builder. None v T1 (len Easy) a T18 (taper).
    Pri variante 'just_finish' NIE sú intervaly ani tempo — len Easy + nedeľný dlhý beh
    s vernými vzdialenosťami z knihy (JUST_FINISH_KM)."""
    if week <= 1 or week >= 18:
        return None
    v = (variant or "advanced").lower()
    out: Dict[str, dict] = {}

    # Just Finish (nenároční): vlastná verná tabuľka — žiadny speed/tempo (utorok nie je SOS).
    # Štvrtok aj nedeľa sú Easy; nedeľa je „dlhý" beh týždňa s knižnou vzdialenosťou.
    if v == "just_finish":
        day = JUST_FINISH_KM.get(week, {})
        thu = day.get("thu")
        if isinstance(thu, (int, float)):
            out["thursday"] = {"kind": "easy", "dist_km": thu, "pace": "easy",
                               "label": f"Easy beh {thu} km (Just Finish — bez tempa)"}
        sun = day.get("sun")
        if isinstance(sun, (int, float)):
            out["sunday"] = {"kind": "long", "dist_km": sun, "pace": "easy",
                             "label": f"Dlhý beh {sun} km @ Easy (Just Finish; vrchol ~16 km)"}
        return out

    # Rebríky podľa variantu: Beginner má BASE fázu T1–5 (speed aj tempo až od T6).
    if v == "beginner":
        speed_l, strength_l, tempo_m = SPEED_LADDER_BEGINNER, STRENGTH_LADDER_BEGINNER, TEMPO_MILES_BEGINNER
    else:
        speed_l, strength_l, tempo_m = SPEED_LADDER, STRENGTH_LADDER, TEMPO_MILES

    if week in speed_l:
        reps, dist_m, rec_m = speed_l[week]
        out["tuesday"] = {"kind": "speed", "reps": reps, "dist_m": dist_m, "recovery_m": rec_m,
                          "pace": "speed", "label": f"Speed {_fmt_reps(reps, dist_m, rec_m)} @ 5k tempo"}
    elif week in strength_l:
        reps, dist_m, rec_m = strength_l[week]
        out["tuesday"] = {"kind": "strength", "reps": reps, "dist_m": dist_m, "recovery_m": rec_m,
                          "pace": "strength", "label": f"Strength {_fmt_reps(reps, dist_m, rec_m)} @ HMP−6 s/km"}
    # Tempo: v Beginner base fáze (T2–5) tempo NIE je — pridá sa až od T6.
    if week in tempo_m:
        tempo_km = round(tempo_m[week] * _MI, 1)
        out["thursday"] = {"kind": "tempo", "dist_km": tempo_km, "pace": "tempo",
                           "label": f"Tempo {tempo_km} km @ cieľové HMP"}
    out["sunday"] = {"kind": "long", "pace": "easy",
                     "label": "Dlhý beh @ Easy (≈13–19 km podľa fázy, vrchol ~19 km; max ~30 % týždenného objemu)"}
    return out


def just_finish_block(week: int) -> str:
    """Verný denný rozpis Just Finish (z knihy) pre daný týždeň do promptu.
    Všetko Easy; nedeľa = dlhý beh (Easy). AI len rozmiestni PRESNE tieto vzdialenosti."""
    day = JUST_FINISH_KM.get(week)
    if not day:
        return "\nPREDPÍSANÝ TÝŽDEŇ (Just Finish): len Easy behy podľa pocitu.\n"
    lines = ["\nPREDPÍSANÝ TÝŽDEŇ — JUST FINISH (verne podľa knihy). DRŽ tieto vzdialenosti — "
             "km NEMEŇ a NEPRIDÁVAJ behy navyše; behy môžeš presunúť na iný deň podľa preferencií "
             "zverenca. Všetko EASY tempom (žiadny speed ani tempo):"]
    for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun"):
        if d == "wed":
            lines.append("  • Streda: voľno (rest / cross-train)")
            continue
        val = day.get(d)
        if val is None:
            lines.append(f"  • {_DAY_SK_FULL[d]}: voľno")
        elif val == "race":
            lines.append(f"  • {_DAY_SK_FULL[d]}: PRETEKY — polmaratón")
        elif d == "sun":
            lines.append(f"  • Nedeľa: dlhý beh {val} km @ Easy")
        else:
            lines.append(f"  • {_DAY_SK_FULL[d]}: Easy beh {val} km")
    return "\n".join(lines) + "\n"


def sos_block(week: int, variant: Optional[str] = "advanced") -> str:
    """Per-week predpísané SOS do promptu — aby AI tréning NEvymýšľala, len rozmiestnila."""
    if (variant or "advanced").lower() == "just_finish":
        return just_finish_block(week)
    sos = sos_for_week(week, variant)
    if not sos:
        if week <= 1:
            return "\nPREDPÍSANÉ SOS (T1): žiadne — len Easy behy (adaptácia).\n"
        return "\nPREDPÍSANÉ SOS (T18 TAPER): žiadne tvrdé intervaly — zostupový týždeň.\n"
    lines = ["\nPREDPÍSANÉ SOS PRE TENTO TÝŽDEŇ (drž sa ich, len ich rozmiestni na dostupné dni):"]
    if "tuesday" in sos:
        lines.append(f"  • Kľúčový intervalový (typicky utorok): {sos['tuesday']['label']}")
    if "thursday" in sos:
        lines.append(f"  • {'Tempo' if sos['thursday']['kind'] == 'tempo' else 'Stredný beh'} (typicky štvrtok): {sos['thursday']['label']}")
    if "sunday" in sos:
        lines.append(f"  • Dlhý (typicky nedeľa): {sos['sunday']['label']}")
    if "tuesday" not in sos and "thursday" not in sos:
        lines.append("  • BASE fáza (Beginner) — tento týždeň BEZ intervalov a tempa: len Easy behy "
                     "a nedeľný dlhý beh. Buduj objem, kvalita príde od T6.")
    if "tuesday" in sos:
        lines.append("  Intervaly zapíš ako JEDEN 'repeat' krok (iterations = počet) s vnorenými krokmi "
                     "[run úsek na danom tempe, recover pauza pomaly]. WU + CD 2–4 km na Easy tempe.")
    return "\n".join(lines) + "\n"


# ── Interpretácia tréningovej záťaže (acute:chronic ratio) ───────────────────

def training_load_block(training_load: Optional[dict]) -> str:
    """Z Garmin training_load (acute/chronic/ratio) vyrobí Hanson interpretáciu pre prompt.
    A:C ratio je kľúčový ukazovateľ preťaženia: >1.4 = riziko, <0.8 = podtrénovanie."""
    if not training_load:
        return ""
    acute = training_load.get("acute_load")
    chronic = training_load.get("chronic_load")
    ratio = training_load.get("ratio")
    # Ak Garmin nevrátil ratio, skús dopočítať z acute/chronic
    if ratio in (None, 0) and acute and chronic:
        try:
            ratio = round(acute / chronic, 2)
        except Exception:
            ratio = None
    if ratio is None:
        return ""
    try:
        r = float(ratio)
    except Exception:
        return ""
    if r > 1.5:
        verdict = "VYSOKÉ RIZIKO preťaženia — výrazne uber objem/intenzitu, zváž extra Easy/rest deň."
    elif r > 1.4:
        verdict = "Zvýšené riziko preťaženia (>1.4) — zmäkči najbližší SOS tréning, dbaj na regeneráciu."
    elif r >= 0.8:
        verdict = "Záťaž v optimálnom pásme (0.8–1.4) — pokračuj podľa plánu."
    else:
        verdict = "Podtrénovanie (<0.8) — je priestor pridať objem/Easy beh, ak to forma dovolí."
    return (
        f"\nTRÉNINGOVÁ ZÁŤAŽ (acute:chronic): akútna {acute or 'N/A'}, chronická {chronic or 'N/A'}, "
        f"ratio {r}. {verdict}\n"
    )


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
        "  HR referencia (NIE riadiaci cieľ — behy riadime tempom; toto sú orientačné pásma):\n"
        f"    Easy strop (AeT): do ~{hr_zones['easy'][1]} bpm  ← Easy nesmie ísť vyššie\n"
        f"    Moderate:   {hr_zones['moderate'][0]}–{hr_zones['moderate'][1]} bpm\n"
        f"    Tempo/HMP:  {hr_zones['tempo'][0]}–{hr_zones['tempo'][1]} bpm\n"
        f"    Threshold:  {hr_zones['threshold'][0]}–{hr_zones['threshold'][1]} bpm\n"
        f"    Speed:      {hr_zones['speed'][0]}–{hr_zones['speed'][1]} bpm\n"
    )
    if lthr_pace:
        out += f"  LT tempo (referencia): {lthr_pace}\n"
    return out
