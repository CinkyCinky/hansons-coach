"""
modules/fetcher.py — Sťahovanie dát z Garmin Connect
"""

from datetime import date, timedelta
from typing import Optional


def get_recent_activities(client, days: int = 7) -> list:
    """Stiahne posledné aktivity za N dní."""
    try:
        activities = client.get_activities(0, 20)
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

    if results:
        return results[0]  # Najnovší
    return None


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

        # Nájdi dnešnú max hodnotu
        today_max = None
        weekly_avg = None
        all_vals = []

        for day_data in bb_data:
            charged = day_data.get("charged")
            if charged is not None:
                all_vals.append(charged)

        if all_vals:
            today_max = all_vals[0] if all_vals else None
            weekly_avg = round(sum(all_vals) / len(all_vals), 1)

        return {
            "today_charged": today_max,
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
