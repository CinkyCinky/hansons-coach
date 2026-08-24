"""
modules/fetcher.py — Sťahovanie dát z Garmin Connect
"""

import logging
import time
from datetime import date, timedelta
from typing import Optional

logger = logging.getLogger("hansons.fetcher")


def _garmin_call(fn, *args, retries: int = 2, base_delay: float = 0.6, **kwargs):
    """Zavolá Garmin endpoint s exponenciálnym backoffom. Pri rate-limite (429) alebo
    dočasnej chybe to skúsi znova namiesto tvrdého zlyhania. Po vyčerpaní pokusov re-raise."""
    attempt = 0
    while True:
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            attempt += 1
            msg = str(e).lower()
            transient = "429" in msg or "too many" in msg or "timeout" in msg or "temporarily" in msg
            if attempt > retries or not transient:
                raise
            delay = base_delay * (2 ** (attempt - 1))
            logger.warning("Garmin %s zlyhal (%s) — pokus %d/%d, čakám %.1fs",
                           getattr(fn, "__name__", "call"), e, attempt, retries, delay)
            time.sleep(delay)


def get_recent_activities(client, days: int = 7) -> list:
    """Stiahne posledné aktivity za N dní."""
    try:
        # Limit škálujeme podľa okna (aktívny bežec má >20 aktivít za 35 dní)
        limit = min(max(20, days * 3), 200)
        activities = _garmin_call(client.get_activities, 0, limit)
        if not activities:
            return []

        cutoff = date.today() - timedelta(days=days)
        recent = []
        for act in activities:
            act_date_str = act.get("startTimeLocal", "")[:10]
            try:
                act_date = date.fromisoformat(act_date_str)
                if act_date >= cutoff:
                    recent.append(act)
            except ValueError:
                continue
        return recent
    except Exception as e:
        print(f"  ⚠️  Aktivity: {e}")
        return []


def _to_celsius(t) -> Optional[int]:
    """Teplota na °C. Metrický Garmin účet vracia °C; ak je hodnota podozrivo
    vysoká (>45), ide o °F a prepočítame ju (bežecká teplota nikdy nie je >45 °C)."""
    if t is None:
        return None
    try:
        t = float(t)
    except (TypeError, ValueError):
        return None
    return round((t - 32) * 5 / 9) if t > 45 else round(t)


def _deg_to_compass(deg) -> Optional[str]:
    """Smer vetra v stupňoch → slovenská skratka svetovej strany."""
    if deg is None:
        return None
    try:
        deg = float(deg)
    except (TypeError, ValueError):
        return None
    dirs = ["S", "SV", "V", "JV", "J", "JZ", "Z", "SZ"]  # od severu po smere hodín
    return dirs[int((deg / 45) + 0.5) % 8]


# Garmin vracia stav oblohy anglicky (weatherTypeDTO.desc) — preložíme na SK,
# aby sa „Cloudy" nezobrazilo v UI ani nešlo do AI trénera. Neznáme necháme tak.
_WEATHER_SK = {
    "clear": "jasno", "clear sky": "jasno", "mostly clear": "prevažne jasno",
    "sunny": "slnečno", "mostly sunny": "prevažne slnečno", "fair": "pekne",
    "partly cloudy": "polojasno", "partly sunny": "polojasno",
    "mostly cloudy": "prevažne zamračené", "cloudy": "zamračené", "overcast": "zamračené",
    "fog": "hmla", "foggy": "hmla", "mist": "hmlisto", "misty": "hmlisto",
    "haze": "opar", "hazy": "opar", "smoke": "dym",
    "rain": "dážď", "light rain": "slabý dážď", "heavy rain": "silný dážď",
    "showers": "prehánky", "rain showers": "dažďové prehánky",
    "scattered showers": "ojedinelé prehánky", "drizzle": "mrholenie",
    "snow": "sneženie", "light snow": "slabé sneženie", "heavy snow": "silné sneženie",
    "snow showers": "snehové prehánky", "flurries": "snehové vločky",
    "sleet": "plieskanica", "freezing rain": "mrznúci dážď",
    "thunderstorm": "búrka", "thunderstorms": "búrky", "thundershowers": "búrkové prehánky",
    "windy": "veterno", "breezy": "vetríno", "hot": "horúco", "cold": "chladno",
    "dust": "prach", "hail": "krupobitie",
}


def _condition_sk(desc):
    """Stav oblohy z Garminu (anglicky) → slovensky. Neznámy reťazec necháme (radšej než prázdny)."""
    if not desc:
        return desc
    return _WEATHER_SK.get(str(desc).strip().lower(), desc)


def get_activity_weather(client, activity_id) -> Optional[dict]:
    """Stiahne počasie zaznamenané k aktivite (Garmin /activity/{id}/weather).
    Bez externého API — Garmin si ukladá podmienky z najbližšej meteostanice
    v čase behu (teplota, pocitová teplota, vlhkosť, vietor, stav oblohy)."""
    try:
        w = _garmin_call(client.get_activity_weather, activity_id)
        if not w or not isinstance(w, dict):
            return None
        temp = _to_celsius(w.get("temp"))
        feels = _to_celsius(w.get("apparentTemp"))
        humidity = w.get("relativeHumidity")
        wind_speed = w.get("windSpeed")
        wind_dir = _deg_to_compass(w.get("windDirection")) or w.get("windDirectionCompassPoint")
        cond = _condition_sk((w.get("weatherTypeDTO") or {}).get("desc")) if isinstance(w.get("weatherTypeDTO"), dict) else None
        if temp is None and humidity is None and wind_speed is None and not cond:
            return None
        return {
            "temp_c": temp,
            "feels_like_c": feels,
            "humidity_pct": round(humidity) if humidity is not None else None,
            "wind_kmh": round(wind_speed) if wind_speed is not None else None,
            "wind_dir": wind_dir,
            "conditions": cond,
        }
    except Exception as e:
        print(f"  ⚠️  Počasie: {e}")
    return None


def get_hrv_data(client) -> Optional[dict]:
    """Stiahne HRV dáta za posledných 7 dní."""
    results = []
    for i in range(7):
        d = (date.today() - timedelta(days=i)).isoformat()
        try:
            hrv = _garmin_call(client.get_hrv_data, d)
            if hrv and hrv.get("hrvSummary"):
                summary = hrv["hrvSummary"]
                # lastNight = "Priem. cez noc" (priemerné HRV počas spánku, ~50 ms)
                # lastNight5MinHigh = "Najvyšší 5-min priemer" (iná metrika, ~83 ms) — NEMIEŠAŤ!
                # Ak lastNight nie je ešte spracované, vypočítaj priemer z hodinových readings.
                last_night = summary.get("lastNight")
                if last_night is None:
                    readings = hrv.get("hrvReadings") or []
                    if isinstance(readings, list):
                        vals = [r.get("hrvValue") for r in readings if r.get("hrvValue")]
                        if vals:
                            last_night = round(sum(vals) / len(vals))
                results.append({
                    "date": d,
                    "weekly_avg": summary.get("weeklyAvg"),
                    "last_night": last_night,
                    "last_5min_high": summary.get("lastNight5MinHigh"),
                    "status": summary.get("status", "unknown"),
                    "feedback": summary.get("feedbackPhrase", ""),
                })
        except Exception:
            pass

    if not results:
        return None
    # Najnovší deň pre status/weekly_avg; last_night + last_5min_high z najnovšieho dňa,
    # ktorý ich má (dnešná noc nemusí byť ešte spracovaná → boli by null).
    latest = results[0]
    latest["last_night"] = next(
        (r["last_night"] for r in results if r.get("last_night") is not None), None
    )
    latest["last_5min_high"] = next(
        (r.get("last_5min_high") for r in results if r.get("last_5min_high") is not None), None
    )
    return latest


def get_sleep_data(client, days: int = 7) -> list:
    """Stiahne dáta o spánku za N dní."""
    results = []
    for i in range(days):
        d = (date.today() - timedelta(days=i)).isoformat()
        try:
            sleep = _garmin_call(client.get_sleep_data, d)
            if sleep and sleep.get("dailySleepDTO"):
                dto = sleep["dailySleepDTO"]
                duration_sec = dto.get("sleepTimeSeconds", 0)
                results.append({
                    "date": d,
                    "duration_hours": round(duration_sec / 3600, 1) if duration_sec else None,
                    "score": dto.get("sleepScores", {}).get("overall", {}).get("value") if dto.get("sleepScores") else None,
                    "deep_pct": dto.get("deepSleepSeconds", 0) / duration_sec * 100 if duration_sec else None,
                    "rem_pct": dto.get("remSleepSeconds", 0) / duration_sec * 100 if duration_sec else None,
                })
        except Exception:
            pass
    return results


def _bb_value(entry) -> Optional[float]:
    """Vytiahne číselnú hodnotu Body Battery (0–100) z jedného záznamu časového radu.
    Garmin vracia záznamy ako [timestamp_ms, hodnota] alebo [timestamp_ms, status, hodnota],
    prípadne dict. Timestamp (veľké číslo) ignoruj, ber číslo v rozsahu 0–100."""
    if isinstance(entry, dict):
        v = entry.get("bodyBatteryValue")
        if v is None:
            v = entry.get("value")
        return v if isinstance(v, (int, float)) and 0 <= v <= 100 else None
    if isinstance(entry, (list, tuple)):
        nums = [x for x in entry if isinstance(x, (int, float)) and 0 <= x <= 100]
        return nums[-1] if nums else None
    return None


def get_body_battery(client) -> Optional[dict]:
    """Stiahne Body Battery za posledných 7 dní a rozlíši DVA pohľady:
      • morning — hodnota pri zobudení (vrchol dňa po nočnom nabití) → ukazovateľ
        KVALITY ZOTAVENIA; patrí do ranného reportu a do hodnotenia formy.
      • current — posledná (živá) hodnota → koľko PALIVA ostáva práve teraz; cez deň
        prirodzene klesá (večer býva nízka aj u oddýchnutého bežca).
    Miešať ich je chyba: večerné dno nie je ranný stav zotavenia."""
    try:
        today = date.today().isoformat()
        week_ago = (date.today() - timedelta(days=6)).isoformat()
        bb_data = _garmin_call(client.get_body_battery, week_ago, today)

        if not bb_data:
            return None

        morning_value = None
        current_value = None
        weekly_avg = None

        # bb_data je list za posledných 7 dní, posledný prvok by mal byť dnešok
        today_data = bb_data[-1]
        values_array = (
            today_data.get("bodyBatteryValuesArray")
            or today_data.get("bodyBatteryValueDescriptors")
            or []
        )
        values = [v for v in (_bb_value(e) for e in values_array) if v is not None]

        if values:
            current_value = values[-1]   # najnovšie meranie = aktuálny stav
            # Ranná hodnota = denný vrchol: BB sa cez noc nabíja a po zobudení už len
            # klesá → max je robustný odhad „pri zobudení" bez závislosti na čase prebudenia.
            morning_value = max(values)

        # Ak Garmin priamo dáva hodnotu pri zobudení / najvyššiu, uprednostni ju.
        wake = today_data.get("bodyBatteryAtWakeTime")
        if isinstance(wake, (int, float)) and 0 <= wake <= 100:
            morning_value = wake

        # Fallback ak časový rad chýbal (rôzne zariadenia)
        if current_value is None:
            current_value = today_data.get("bodyBatteryMostRecentValue") or today_data.get("charged")
        if morning_value is None:
            morning_value = today_data.get("bodyBatteryHighestValue")

        # Týždenný priemer nočného nabitia (charged) — orientačný, iná veličina než stav.
        charged_vals = [d.get("charged") for d in bb_data if d.get("charged") is not None]
        if charged_vals:
            weekly_avg = round(sum(charged_vals) / len(charged_vals), 1)

        return {
            "morning": morning_value,
            "current": current_value,
            "today_charged": current_value,  # spätná kompatibilita (deprecated, = current)
            "weekly_avg": weekly_avg,
            "raw": bb_data[:7],
        }
    except Exception as e:
        print(f"  ⚠️  Body Battery: {e}")
        return None


def get_training_readiness(client) -> Optional[dict]:
    """Stiahne Training Readiness skóre."""
    try:
        today = date.today().isoformat()
        data = _garmin_call(client.get_training_readiness, today)
        if data:
            # Garmin vracia list alebo dict
            if isinstance(data, list) and data:
                item = data[0]
            elif isinstance(data, dict):
                item = data
            else:
                return None

            return {
                "score": item.get("score") or item.get("trainingReadinessScore"),
                "level": item.get("level") or item.get("trainingReadinessLevel"),
                "feedback": item.get("feedbackLong") or item.get("feedback", ""),
            }
    except Exception as e:
        print(f"  ⚠️  Training Readiness: {e}")
    return None


def _deep_find(payload, keys: tuple):
    """Nájde prvú nenulovú hodnotu ktoréhokoľvek z `keys` kdekoľvek vo vnorenej odpovedi.

    Garmin vracia training status zabalený per-zariadenie
    (`mostRecentTrainingStatus.latestTrainingStatusData.<deviceId>.acuteTrainingLoadDTO…`),
    pričom tvar sa medzi zariadeniami aj verziami API líši. Ploché `payload.get(...)`
    preto vracalo None a karta A:C záťaže sa nikdy nezobrazila. Prehľadávame do šírky,
    takže plytší (a teda konkrétnejší) výskyt vyhráva.
    """
    queue = [payload]
    while queue:
        node = queue.pop(0)
        if isinstance(node, dict):
            for k in keys:
                v = node.get(k)
                if v is not None:
                    return v
            queue.extend(node.values())
        elif isinstance(node, list):
            queue.extend(node)
    return None


def get_training_load(client) -> Optional[dict]:
    """Stiahne Training Load dáta (akútna/chronická záťaž + ich pomer).

    Pomer akútnej a chronickej záťaže je Hansonov guardrail proti preťaženiu
    (docs/HANSON_METHODOLOGY_AND_REDESIGN.md §2.4): nad 1.4 sa má ubrať objem.
    """
    try:
        today = date.today().isoformat()
        stats = _garmin_call(client.get_training_status, today)
        if not stats:
            return None

        acute = _deep_find(stats, ("acuteTrainingLoad", "dailyTrainingLoadAcute"))
        chronic = _deep_find(stats, ("chronicTrainingLoad", "dailyTrainingLoadChronic"))
        ratio = _deep_find(stats, ("dailyAcuteChronicWorkloadRatio", "trainingLoadRatio"))
        status = _deep_find(stats, ("acwrStatus", "trainingStatusLoad", "trainingStatus"))

        # Garmin niekde dáva pomer v percentách (acwrPercent) — prepočítaj na násobok.
        if ratio is None:
            pct = _deep_find(stats, ("acwrPercent",))
            if isinstance(pct, (int, float)):
                ratio = round(pct / 100, 2)
        # Stále nič, ale máme obe zložky → dopočítaj (rovnako ako to robí frontend).
        if ratio is None and isinstance(acute, (int, float)) and isinstance(chronic, (int, float)) and chronic:
            ratio = round(acute / chronic, 2)

        if acute is None and chronic is None and ratio is None:
            # Nech sa to nedebuguje naslepo — vypíš, čo Garmin vlastne vrátil.
            logger.warning(
                "Training Load: v odpovedi nie sú polia záťaže. Kľúče najvyššej úrovne: %s",
                list(stats.keys()) if isinstance(stats, dict) else type(stats).__name__,
            )

        return {"acute_load": acute, "chronic_load": chronic, "ratio": ratio, "status": status}
    except Exception as e:
        print(f"  ⚠️  Training Load: {e}")
    return None


def get_stats_summary(client) -> Optional[dict]:
    """Stiahne základné denné štatistiky."""
    try:
        today = date.today().isoformat()
        stats = _garmin_call(client.get_stats, today)
        if stats:
            return {
                "resting_hr": stats.get("restingHeartRate"),
                "avg_stress": stats.get("averageStressLevel"),
                "steps": stats.get("totalSteps"),
            }
    except Exception as e:
        print(f"  ⚠️  Stats: {e}")
    return None


def _speed_to_pace_str(speed_raw) -> Optional[str]:
    """Garmin lactateThresholdSpeed → tempo (min:sec/km).
    Empiricky: skutočné m/s = uložená hodnota * 10 (napr. 0.322 → 3.22 m/s → 5:10/km).
    Vyberie tú interpretáciu, ktorá dá reálne tempo (2:30–8:00/km)."""
    try:
        v = float(speed_raw)
        if v <= 0:
            return None
        for ms in (v * 10.0, v):  # preferuj *10 interpretáciu
            pace_sec = round(1000 / ms)
            if 150 <= pace_sec <= 480:  # sanity: 2:30–8:00 /km
                return f"{pace_sec // 60}:{pace_sec % 60:02d}/km"
    except Exception:
        pass
    return None


def get_lactate_threshold(client) -> Optional[dict]:
    """Stiahne LTHR (tep) a LT tempo z Garminu.
    Reálna štruktúra: {'speed_and_heart_rate': {'speed': .., 'heartRate': ..}}."""
    try:
        data = _garmin_call(client.get_lactate_threshold)
        if not data:
            return None
        if isinstance(data, list) and data:
            data = data[0]

        shr = data.get("speed_and_heart_rate") if isinstance(data, dict) else None
        if isinstance(shr, dict):
            lthr = shr.get("heartRate")
            speed_raw = shr.get("speed")
        else:
            # fallback pre iné verzie API
            lthr = data.get("heartRate") or data.get("lactateThresholdHeartRate") or data.get("value")
            speed_raw = data.get("speed") or data.get("lactateThresholdSpeed")

        return {
            "lthr": int(lthr) if lthr else None,
            "lthr_pace": _speed_to_pace_str(speed_raw) if speed_raw else None,
        }
    except Exception as e:
        print(f"  ⚠️  LTHR: {e}")
    return None


def get_athlete_profile(client) -> Optional[dict]:
    """Stiahne osobné údaje športovca z Garmin účtu:
    vek, váha, výška, pohlavie, VO2max, LTHR. Toto sú dáta, ktoré tréner potrebuje
    na presný výpočet zón a záťaže (rovnako ako lokálny tréner)."""
    try:
        prof = _garmin_call(client.get_user_profile) or {}
        ud = prof.get("userData", {}) if isinstance(prof, dict) else {}

        # Vek z dátumu narodenia
        age = None
        bd = ud.get("birthDate")
        if bd:
            try:
                b = date.fromisoformat(str(bd)[:10])
                today = date.today()
                age = today.year - b.year - ((today.month, today.day) < (b.month, b.day))
            except Exception:
                pass

        weight_g = ud.get("weight")
        weight_kg = round(weight_g / 1000, 1) if weight_g else None

        return {
            "age": age,
            "gender": ud.get("gender"),
            "weight_kg": weight_kg,
            "height_cm": round(ud.get("height")) if ud.get("height") else None,
            "vo2max": ud.get("vo2MaxRunning"),
            "lthr": ud.get("lactateThresholdHeartRate"),
            "lthr_pace": _speed_to_pace_str(ud.get("lactateThresholdSpeed")),
        }
    except Exception as e:
        print(f"  ⚠️  Athlete profile: {e}")
    return None


def get_max_hr_from_activities(client, days: int = 90) -> Optional[int]:
    """Odhadne Max HR z histórie aktivít (najvyšší zaznamenaný tep)."""
    try:
        limit = min(days * 2, 200)
        activities = _garmin_call(client.get_activities, 0, limit)
        max_hr = 0
        for act in (activities or []):
            mhr = act.get("maxHR") or 0
            if mhr > max_hr:
                max_hr = mhr
        return int(max_hr) if max_hr > 100 else None
    except Exception as e:
        print(f"  ⚠️  Max HR: {e}")
    return None


def _easy_band(lthr: Optional[int], z2: tuple, z3: tuple) -> tuple:
    """Easy/regeneračné pásmo podľa Humphreyho: od spodku Z2 po AERÓBNY PRAH.
    Aeróbny prah ≈ 0.86 × LTHR (recovery beh musí ostať POD prahom laktátu).
    Garminovo Z2-Z3 rozhranie je len matematický predel, nie hranica regenerácie —
    preto Easy siaha o niečo vyššie, do spodnej časti Z3 (napr. LTHR 175 → strop ~150)."""
    floor = z2[0]
    if lthr:
        aet = round(lthr * 0.86)
        # clamp: nikdy nie pod Garmin Z2 strop, nikdy nie nad stred Z3
        aet = max(z2[1], min(aet, round((z3[0] + z3[1]) / 2)))
        return (floor, aet)
    return z2  # bez LTHR ostaň pri Garmin Z2


def get_garmin_hr_zones(client) -> Optional[dict]:
    """Stiahne REÁLNE nakonfigurované HR zóny priamo z Garminu.
    Preferuje šport-špecifické bežecké zóny (sport=RUNNING), fallback na DEFAULT.
    Garmin vracia 'floor' (spodný okraj) každej z 5 zón; strop zóny N = floor zóny N+1,
    strop Z5 = maxHeartRateUsed. Mapuje 5 Garmin zón na Hanson tréningové názvy."""
    try:
        data = _garmin_call(client.connectapi, "/biometric-service/heartRateZones")
        if not data or not isinstance(data, list):
            return None

        by_sport = {(z.get("sport") or "").upper(): z for z in data}
        z = by_sport.get("RUNNING") or by_sport.get("DEFAULT") or data[0]
        if not z:
            return None

        max_hr = z.get("maxHeartRateUsed")
        floors = [
            z.get("zone1Floor"), z.get("zone2Floor"), z.get("zone3Floor"),
            z.get("zone4Floor"), z.get("zone5Floor"),
        ]
        if not all(floors) or not max_hr:
            return None

        # Hranice jednotlivých zón (floor -> strop)
        z1 = (floors[0], floors[1])
        z2 = (floors[1], floors[2])
        z3 = (floors[2], floors[3])
        z4 = (floors[3], floors[4])
        z5 = (floors[4], max_hr)

        lthr = z.get("lactateThresholdHeartRateUsed")
        easy = _easy_band(lthr, z2, z3)

        return {
            "source": f"Garmin/{z.get('sport', 'DEFAULT')}",
            "method": z.get("trainingMethod"),
            "lthr": lthr,
            "max_hr": max_hr,
            "resting_hr": z.get("restingHeartRateUsed"),
            "zones": {"z1": z1, "z2": z2, "z3": z3, "z4": z4, "z5": z5},
            # Hanson mapovanie na reálne Garmin zóny:
            "easy":      easy,            # Easy/dlhé: Z2 až po aeróbny prah (~0.86 LTHR)
            "moderate":  (easy[1], z4[0]),  # od aeróbneho prahu po spodok Z4
            "tempo":     z4,              # HMP/tempo (pri polmaratóne ~prahová intenzita)
            "threshold": z4,              # prah laktátu (LT)
            "speed":     z5,              # rýchlostné/silové intervaly
        }
    except Exception as e:
        print(f"  ⚠️  Garmin HR zones: {e}")
    return None


def resolve_hr_zones(client, lthr: Optional[int] = None,
                     max_hr: Optional[int] = None,
                     resting_hr: Optional[int] = None) -> Optional[dict]:
    """Jednotný zdroj HR zón. Priorita podľa želania používateľa:
    1) reálne bežecké zóny z Garminu (RUNNING), 2) DEFAULT z Garminu,
    3) výpočet z LTHR/MaxHR ak Garmin nič nevráti."""
    z = get_garmin_hr_zones(client)
    if z:
        return z
    return compute_hr_zones(lthr, max_hr, resting_hr)


def compute_hr_zones(lthr: Optional[int], max_hr: Optional[int], resting_hr: Optional[int]) -> Optional[dict]:
    """Vypočíta tréningové HR zóny podľa Hansons Half-Marathon metódy.
    Použije sa LEN ako fallback, ak Garmin nevráti nakonfigurované zóny.
    Priorita: LTHR → Max HR → None."""
    if lthr:
        # Hansonova metóda: zóny odvodzujeme primárne od LTHR.
        # Easy strop = aeróbny prah (~0.86 LTHR), aby regeneračný beh ostal pod LT.
        return {
            "source": "LTHR",
            "lthr": lthr,
            "easy":      (round(lthr * 0.72), round(lthr * 0.86)),   # po aeróbny prah
            "moderate":  (round(lthr * 0.86), round(lthr * 0.94)),   # nad AeT pod LT
            "tempo":     (round(lthr * 0.94), round(lthr * 1.00)),   # Hanson Tempo/HMP
            "threshold": (round(lthr * 0.97), round(lthr * 1.00)),   # AT/LT
            "speed":     (round(lthr * 1.00), round(lthr * 1.06)),   # Speed/Strength
        }
    if max_hr:
        # Fallback: klasické % z Max HR
        return {
            "source": "MaxHR",
            "max_hr": max_hr,
            "easy":      (round(max_hr * 0.60), round(max_hr * 0.70)),
            "moderate":  (round(max_hr * 0.70), round(max_hr * 0.80)),
            "tempo":     (round(max_hr * 0.80), round(max_hr * 0.87)),
            "threshold": (round(max_hr * 0.87), round(max_hr * 0.93)),
            "speed":     (round(max_hr * 0.93), round(max_hr * 1.00)),
        }
    return None
