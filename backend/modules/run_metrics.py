"""
modules/run_metrics.py — Odvodené metriky z behu (terén, Grade Adjusted Pace).

Vlna 1: prevýšenie + GAP. Sem postupne pribudnú ďalšie odvodené ukazovatele
(bežecká ekonomika, aeróbny decoupling, efficiency factor).
"""

from typing import Optional


def _minetti_cost(grade: float) -> float:
    """Metabolický náklad behu podľa sklonu (Minetti et al., 2002), J/kg/m.
    grade = prevýšenie/vzdialenosť ako desatinné číslo (0.05 = 5 % stúpanie).
    Konštanta 3.6 = náklad na rovine (grade 0)."""
    g = grade
    return 155.4 * g**5 - 30.4 * g**4 - 43.3 * g**3 + 46.3 * g**2 + 19.5 * g + 3.6


def grade_adjust_factor(grade: float) -> float:
    """Pomer nákladu pri danom sklone voči rovine. >1 do kopca, <1 z kopca."""
    # Minetti je validný zhruba pre ±45 %; bežecky stačí clamp na ±30 %.
    grade = max(-0.30, min(0.30, grade))
    return _minetti_cost(grade) / 3.6


def gap_pace_sec(pace_sec_km: Optional[float], dist_m: Optional[float],
                 net_elev_m: Optional[float]) -> Optional[int]:
    """Grade Adjusted Pace: tempo prepočítané, akoby beh bol po rovine.

    Vracia ekvivalentné tempo na rovine v s/km — t. j. aké tempo by si pri
    rovnakej námahe zabehol na rovine. Do kopca → GAP rýchlejšie ako reálne tempo,
    z kopca → GAP pomalšie.

    POZN.: na úrovni lapu používame ČISTÉ prevýšenie (stúpanie − klesanie).
    Pri zvlnenom úseku, kde sa stúpanie a klesanie vyrušia, to GAP podhodnotí —
    presný per-bodový GAP si vyžaduje časový rad (neskoršia vlna).
    """
    if not pace_sec_km or not dist_m or dist_m <= 0 or net_elev_m is None:
        return None
    grade = net_elev_m / dist_m
    factor = grade_adjust_factor(grade)
    if factor <= 0:
        return None
    return round(pace_sec_km / factor)


def lap_elevation(lap: dict) -> tuple:
    """Vytiahne (stúpanie, klesanie) v metroch z lap/split DTO. None ak chýba."""
    gain = lap.get("elevationGain")
    loss = lap.get("elevationLoss")
    return (
        round(gain) if gain is not None else None,
        round(loss) if loss is not None else None,
    )


def fmt_pace(sec: Optional[float]) -> str:
    """Sekundy/km → 'm:ss'. Prázdny reťazec ak None."""
    if not sec:
        return ""
    sec = round(sec)
    return f"{sec // 60}:{sec % 60:02d}"


# ── Vlna 2: bežecká ekonomika (running dynamics) ──────────────────────────────

def _norm_vert_osc(v) -> Optional[float]:
    """Vertikálna oscilácia na cm. Garmin niekedy vracia mm (80–120), inokedy cm
    (8–12). Fyziologický rozsah je 5–15 cm → hodnoty >25 ber ako mm a vydeľ 10."""
    if v is None:
        return None
    return round(v / 10, 1) if v > 25 else round(v, 1)


def _norm_stride(v) -> Optional[float]:
    """Dĺžka kroku na cm. Garmin vracia cm (90–160) alebo m (0.9–1.6) → zjednoť na cm."""
    if v is None:
        return None
    return round(v * 100) if v < 5 else round(v)


def running_dynamics(d: dict) -> dict:
    """Vytiahne bežeckú dynamiku zo summaryDTO alebo lapDTO (rovnaké názvy polí).
    Vracia len kľúče, ktoré majú hodnotu (snímač ich nemusí merať)."""
    out: dict = {}
    vo = d.get("avgVerticalOscillation")
    if vo is not None:
        out["vertical_oscillation_cm"] = _norm_vert_osc(vo)
    vr = d.get("avgVerticalRatio")
    if vr is not None:
        out["vertical_ratio_pct"] = round(vr, 1)
    gct = d.get("avgGroundContactTime")
    if gct is not None:
        out["ground_contact_ms"] = round(gct)
    sl = d.get("avgStrideLength")
    if sl is not None:
        out["stride_length_cm"] = _norm_stride(sl)
    bal = d.get("avgGroundContactBalance")
    if bal is not None:
        out["gct_balance_pct"] = round(bal, 1)
    return out


def _avg(group: list, key: str, transform=None) -> Optional[float]:
    vals = []
    for lap in group:
        v = lap.get(key)
        if v is None:
            continue
        vals.append(transform(v) if transform else v)
    return sum(vals) / len(vals) if vals else None


def form_drift(laps: Optional[list]) -> Optional[dict]:
    """Rozpad formy: porovná 2. a 1. polovicu behu (delta = 2. − 1.).
    Objektívny signál únavy/durability v Hansonovej kumulovanej únave — keď pri
    rovnakom úsilí v 2. polovici rastie vert. pomer a tep a klesá dĺžka kroku,
    forma sa rozpadá. Najvýpovednejšie pri rovnomerných behoch (Easy/dlhý/tempo);
    pri intervaloch s rozcvičkou/výklusom je porovnanie len orientačné.
    Potrebuje aspoň 4 platné lapy."""
    runs = [l for l in (laps or []) if (l.get("distance") or 0) > 0 and l.get("averageSpeed")]
    if len(runs) < 4:
        return None
    mid = len(runs) // 2
    first, second = runs[:mid], runs[mid:]

    out: dict = {}
    sp1, sp2 = _avg(first, "averageSpeed"), _avg(second, "averageSpeed")
    if sp1 and sp2:
        out["pace_sec_delta"] = round(1000 / sp2 - 1000 / sp1)  # +pomalšie v 2. polovici
    hr1, hr2 = _avg(first, "averageHR"), _avg(second, "averageHR")
    if hr1 and hr2:
        out["hr_delta"] = round(hr2 - hr1)
    vr1, vr2 = _avg(first, "avgVerticalRatio"), _avg(second, "avgVerticalRatio")
    if vr1 and vr2:
        out["vertical_ratio_delta"] = round(vr2 - vr1, 1)
    sl1 = _avg(first, "avgStrideLength", _norm_stride)
    sl2 = _avg(second, "avgStrideLength", _norm_stride)
    if sl1 and sl2:
        out["stride_length_delta_cm"] = round(sl2 - sl1)
    cad1 = _avg(first, "averageRunningCadenceInStepsPerMinute")
    cad2 = _avg(second, "averageRunningCadenceInStepsPerMinute")
    if cad1 and cad2:
        out["cadence_delta"] = round(cad2 - cad1)
    return out or None


def _signed(v, unit: str = "") -> str:
    """'+5s', '-3cm' … so znamienkom aj pri kladných."""
    return f"{'+' if v >= 0 else ''}{v}{unit}"


def form_drift_str(drift: Optional[dict]) -> str:
    """Ľudsky čitateľný rozpad formy pre AI/zobrazenie. Prázdny reťazec ak None."""
    if not drift:
        return ""
    parts = []
    if drift.get("pace_sec_delta") is not None:
        parts.append(f"tempo {_signed(drift['pace_sec_delta'], 's/km')}")
    if drift.get("hr_delta") is not None:
        parts.append(f"tep {_signed(drift['hr_delta'], ' bpm')}")
    if drift.get("vertical_ratio_delta") is not None:
        parts.append(f"vert. pomer {_signed(drift['vertical_ratio_delta'], '%')}")
    if drift.get("stride_length_delta_cm") is not None:
        parts.append(f"dĺžka kroku {_signed(drift['stride_length_delta_cm'], ' cm')}")
    if drift.get("cadence_delta") is not None:
        parts.append(f"kadencia {_signed(drift['cadence_delta'], ' spm')}")
    return ", ".join(parts)


def dynamics_str(dyn: dict) -> str:
    """Kompaktný zápis bežeckej dynamiky pre AI/lap riadok. Prázdny ak nič."""
    if not dyn:
        return ""
    bits = []
    if "vertical_ratio_pct" in dyn:
        bits.append(f"pomer {dyn['vertical_ratio_pct']}%")
    if "vertical_oscillation_cm" in dyn:
        bits.append(f"VO {dyn['vertical_oscillation_cm']}cm")
    if "ground_contact_ms" in dyn:
        bits.append(f"GCT {dyn['ground_contact_ms']}ms")
    if "stride_length_cm" in dyn:
        bits.append(f"krok {dyn['stride_length_cm']}cm")
    return " ".join(bits)


# ── Vlna 3: počasie ───────────────────────────────────────────────────────────

def weather_str(w: Optional[dict]) -> str:
    """Ľudsky čitateľné počasie pre AI/zobrazenie. Prázdny reťazec ak None."""
    if not w:
        return ""
    bits = []
    if w.get("temp_c") is not None:
        s = f"{w['temp_c']} °C"
        if w.get("feels_like_c") is not None and w["feels_like_c"] != w["temp_c"]:
            s += f" (pocitovo {w['feels_like_c']} °C)"
        bits.append(s)
    if w.get("humidity_pct") is not None:
        bits.append(f"vlhkosť {w['humidity_pct']} %")
    if w.get("wind_kmh") is not None:
        wd = f" {w['wind_dir']}" if w.get("wind_dir") else ""
        bits.append(f"vietor {w['wind_kmh']} km/h{wd}")
    if w.get("conditions"):
        bits.append(str(w["conditions"]))
    return ", ".join(bits)


# ── Vlna 4: odvodené fitness ukazovatele ──────────────────────────────────────

def efficiency_factor(pace_sec_km: Optional[float], avg_hr: Optional[float]) -> Optional[float]:
    """Efficiency Factor = ekonomika behu = rýchlosť (m/min) / priemerný tep.
    Vyššie = lepšie (za rovnaký tep prejdeš viac). Najlepšie s GAP tempom (terénne
    neutrálne). Absolútna hodnota nič nehovorí — DÔLEŽITÝ JE TREND v čase pri
    porovnateľných (Easy) behoch: rastúci EF = objektívne stúpajúca kondícia."""
    if not pace_sec_km or not avg_hr or pace_sec_km <= 0 or avg_hr <= 0:
        return None
    m_per_min = 60000 / pace_sec_km
    return round(m_per_min / avg_hr, 3)


def decoupling(laps: Optional[list]) -> Optional[float]:
    """Aeróbny decoupling (Pa:HR): o koľko klesla ekonomika (rýchlosť/tep) v 2.
    polovici behu oproti 1. Kladné % = tep driftoval hore voči tempu.
    <5 % = výborná aeróbna báza/durability; 5–8 % mierny drift; >8 % výrazný
    (únava, teplo, slabšia báza). Najvýpovednejšie pri rovnomerných behoch;
    potrebuje ≥4 platné lapy s tempom aj tepom."""
    runs = [
        l for l in (laps or [])
        if (l.get("distance") or 0) > 0 and l.get("averageSpeed") and l.get("averageHR")
    ]
    if len(runs) < 4:
        return None
    mid = len(runs) // 2
    first, second = runs[:mid], runs[mid:]

    def eff(group):
        sp = _avg(group, "averageSpeed")
        hr = _avg(group, "averageHR")
        return (sp / hr) if sp and hr else None

    e1, e2 = eff(first), eff(second)
    if not e1 or not e2:
        return None
    return round((e1 - e2) / e1 * 100, 1)


def decoupling_label(pct: Optional[float]) -> Optional[str]:
    """Slovná interpretácia decouplingu."""
    if pct is None:
        return None
    if pct < 5:
        return "výborná aeróbna báza"
    if pct < 8:
        return "mierny drift"
    return "výrazný drift (únava/teplo/slabšia báza)"
