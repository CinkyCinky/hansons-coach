"""
modules/fetcher.py — Sťahovanie dát z Garmin Connect
"""

from datetime import date, timedelta
from typing import Optional


def get_recent_activities(client, days: int = 7) -> list:
    """Stiahne posledné aktivity za N dní."""
    try:
        # Limit škálujeme podľa okna (aktívny bežec má >20 aktivít za 35 dní)
        limit = min(max(20, days * 3), 200)
        activities = client.get_activities(0, limit)
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


def get_hrv_data(client) -> Optional[dict]:
    """Stiahne HRV dáta za posledných 7 dní."""
    results = []
    for i in range(7):
        d = (date.today() - timedelta(days=i)).isoformat()
        try:
            hrv = client.get_hrv_data(d)
            if hrv and hrv.get("hrvSummary"):
                summary = hrv["hrvSummary"]
                results.append({
                    "date": d,
                    "weekly_avg": summary.get("weeklyAvg"),
                    "last_night": summary.get("lastNight"),
                    "status": summary.get("status", "unknown"),
                    "feedback": summary.get("feedbackPhrase", ""),
                })
        except Exception:
            pass

    if not results:
        return None
    # Najnovší deň pre status/weekly_avg; last_night z najnovšieho dňa, ktorý ho má
    # (dnešná noc nemusí byť ešte spracovaná → bola by null).
    latest = results[0]
    latest["last_night"] = next(
        (r["last_night"] for r in results if r.get("last_night") is not None), None
    )
    return latest


def get_sleep_data(client, days: int = 7) -> list:
    """Stiahne dáta o spánku za N dní."""
    results = []
    for i in range(days):
        d = (date.today() - timedelta(days=i)).isoformat()
        try:
            sleep = client.get_sleep_data(d)
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


def get_body_battery(client) -> Optional[dict]:
    """Stiahne Body Battery za posledných 7 dní."""
    try:
        today = date.today().isoformat()
        week_ago = (date.today() - timedelta(days=6)).isoformat()
        bb_data = client.get_body_battery(week_ago, today)

        if not bb_data:
            return None

        # Nájdi aktuálnu hodnotu (posledný záznam z dnešného dňa)
        current_value = None
        weekly_avg = None
        
        # bb_data je list za posledných 7 dní, posledný prvok by mal byť dnešok
        if bb_data:
            today_data = bb_data[-1]
            # Skús nájsť bodyBatteryValuesArray
            values_array = today_data.get("bodyBatteryValueDescriptors") or today_data.get("bodyBatteryValuesArray")
            if values_array and len(values_array) > 0:
                # Posledná známa hodnota v poli (timestamp, value)
                last_entry = values_array[-1]
                if isinstance(last_entry, list) and len(last_entry) >= 2:
                    current_value = last_entry[1]
                elif isinstance(last_entry, dict):
                    current_value = last_entry.get("bodyBatteryValue") or last_entry.get("value")
            
            # Ak sa nenašlo cez pole, skús default
            if current_value is None:
                 # Fallback na charged, hoci to nie je to isté
                 current_value = today_data.get("charged")
                 
            # Vypočítajme týždenný priemer "charged" len pre info
            charged_vals = [d.get("charged") for d in bb_data if d.get("charged") is not None]
            if charged_vals:
                weekly_avg = round(sum(charged_vals) / len(charged_vals), 1)

        return {
            "today_charged": current_value,
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
        data = client.get_training_readiness(today)
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


def get_training_load(client) -> Optional[dict]:
    """Stiahne Training Load dáta."""
    try:
        today = date.today().isoformat()
        stats = client.get_training_status(today)
        if stats:
            return {
                "acute_load": stats.get("acuteTrainingLoad"),
                "chronic_load": stats.get("chronicTrainingLoad"),
                "ratio": stats.get("trainingLoadRatio"),
                "status": stats.get("trainingStatusLoad"),
            }
    except Exception as e:
        print(f"  ⚠️  Training Load: {e}")
    return None


def get_stats_summary(client) -> Optional[dict]:
    """Stiahne základné denné štatistiky."""
    try:
        today = date.today().isoformat()
        stats = client.get_stats(today)
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
        data = client.get_lactate_threshold()
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
        prof = client.get_user_profile() or {}
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
        activities = client.get_activities(0, limit)
        max_hr = 0
        for act in (activities or []):
            mhr = act.get("maxHR") or 0
            if mhr > max_hr:
                max_hr = mhr
        return int(max_hr) if max_hr > 100 else None
    except Exception as e:
        print(f"  ⚠️  Max HR: {e}")
    return None


def compute_hr_zones(lthr: Optional[int], max_hr: Optional[int], resting_hr: Optional[int]) -> Optional[dict]:
    """Vypočíta tréningové HR zóny podľa Hansons Half-Marathon metódy.
    Priorita: LTHR → Max HR → None."""
    if lthr:
        # Hansonova metóda: zóny odvodzujeme primárne od LTHR
        return {
            "source": "LTHR",
            "lthr": lthr,
            "easy":      (round(lthr * 0.75), round(lthr * 0.83)),   # cca Z1-Z2
            "moderate":  (round(lthr * 0.83), round(lthr * 0.89)),   # cca Z3
            "tempo":     (round(lthr * 0.89), round(lthr * 0.94)),   # Hanson Tempo
            "threshold": (round(lthr * 0.94), round(lthr * 1.00)),   # AT/LT
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
