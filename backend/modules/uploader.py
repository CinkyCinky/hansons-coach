"""
modules/uploader.py — Nahrávanie tréningov do Garmin Connect
"""

import json
import sys
from pathlib import Path
from .workout_builder import build_garmin_workout


# ── Garmin Connect API endpointy ──────────────────────────────────────────────

WORKOUT_SERVICE = "/workout-service/workout"
SCHEDULE_SERVICE = "/workout-service/schedule"


def _garmin_post(client, endpoint: str, data: dict) -> dict:
    """POST request cez garth session."""
    try:
        response = client.client.post("connectapi", endpoint, json=data)
        if hasattr(response, "json"):
            return response.json()
        return response if isinstance(response, dict) else {}
    except Exception as e:
        raise RuntimeError(f"Garmin API chyba: {e}")


def _garmin_get(client, endpoint: str) -> any:
    """GET request cez garth session."""
    try:
        response = client.client.get("connectapi", endpoint)
        if hasattr(response, "json"):
            return response.json()
        return response
    except Exception as e:
        raise RuntimeError(f"Garmin API chyba: {e}")


def _garmin_delete(client, endpoint: str):
    """DELETE request cez garth session."""
    try:
        client.client.request("DELETE", "connectapi", endpoint)
    except Exception as e:
        raise RuntimeError(f"Garmin API chyba pri mazaní: {e}")


# ── Upload jedného tréningu ────────────────────────────────────────────────────

def upload_workout_file(client, file_path: str, scheduled_date: str = None):
    """
    Nahrá jeden tréning z JSON súboru do Garmin Connect.

    Args:
        client: Autentifikovaný Garmin klient
        file_path: Cesta k JSON súboru s tréningom
        scheduled_date: Dátum YYYY-MM-DD (ak nie je v súbore)
    """
    file = Path(file_path)
    if not file.exists():
        print(f"❌ Súbor neexistuje: {file_path}")
        sys.exit(1)

    with open(file, "r", encoding="utf-8") as f:
        workout_def = json.load(f)

    _upload_single_workout(client, workout_def, scheduled_date)


def _upload_single_workout(client, workout_def: dict, scheduled_date: str = None) -> str:
    """
    Nahrá jeden tréning a voliteľne ho naplánuje.

    Returns:
        workoutId (str) nahraného tréningu
    """
    name = workout_def.get("name", "Tréning")
    date_from_def = workout_def.get("scheduled_date")
    target_date = scheduled_date or date_from_def

    print(f"\n  📤 Nahrávam: {name}")
    if target_date:
        print(f"     Dátum: {target_date}")

    # Konvertuj do Garmin formátu
    garmin_workout = build_garmin_workout(workout_def)

    # Nahraj tréning
    try:
        result = _garmin_post(client, WORKOUT_SERVICE, garmin_workout)
        workout_id = str(result.get("workoutId", ""))

        if not workout_id:
            print(f"  ⚠️  Tréning bol nahraný, ale workoutId nebol vrátený.")
            print(f"     Skontroluj Garmin Connect > Tréningy")
            return ""

        print(f"  ✅ Nahraný! ID: {workout_id}")

        # Naplánuj na konkrétny dátum
        if target_date:
            _schedule_workout(client, workout_id, target_date)

        return workout_id

    except RuntimeError as e:
        print(f"  ❌ Chyba pri nahrávaní '{name}': {e}")
        return ""


def _schedule_workout(client, workout_id: str, date_str: str):
    """Naplánuje tréning na konkrétny dátum v Garmin Connect."""
    try:
        _garmin_post(
            client,
            f"{SCHEDULE_SERVICE}/{workout_id}",
            {"date": date_str}
        )
        print(f"  📅 Naplánovaný na: {date_str}")
    except RuntimeError as e:
        print(f"  ⚠️  Naplánovat sa nepodarilo: {e}")
        print(f"     Tréning nájdeš v Garmin Connect > Tréningy a môžeš ho priradiť manuálne.")


# ── Upload celého týždenného plánu ────────────────────────────────────────────

def upload_week_plan(client, file_path: str):
    """
    Nahrá celý týždenný plán z JSON súboru.

    Formát súboru:
    {
      "week": 1,
      "description": "Týždeň 1 — Base Building",
      "workouts": [
        { ...workout_def_1... },
        { ...workout_def_2... }
      ]
    }
    """
    file = Path(file_path)
    if not file.exists():
        print(f"❌ Súbor neexistuje: {file_path}")
        sys.exit(1)

    with open(file, "r", encoding="utf-8") as f:
        plan = json.load(f)

    week_num = plan.get("week", "?")
    description = plan.get("description", "")
    workouts = plan.get("workouts", [])

    print()
    print(f"╔══════════════════════════════════════════════╗")
    print(f"║   📅 Nahrávam Týždeň {week_num}: {description[:25]:<25} ║")
    print(f"╚══════════════════════════════════════════════╝")
    print(f"  Počet tréningov: {len(workouts)}")

    uploaded = 0
    failed = 0

    for workout_def in workouts:
        workout_id = _upload_single_workout(client, workout_def)
        if workout_id:
            uploaded += 1
        else:
            failed += 1

    print()
    print(f"╔══════════════════════════════════════════════╗")
    print(f"║   Výsledok:                                  ║")
    print(f"║   ✅ Nahratých:    {uploaded:<3}                       ║")
    if failed:
        print(f"║   ❌ Zlyhalo:      {failed:<3}                       ║")
    print(f"║                                              ║")
    print(f"║   Otvor Garmin Connect > Kalendár            ║")
    print(f"║   Tréningy uvidíš v príslušných dňoch.       ║")
    print(f"╚══════════════════════════════════════════════╝")


# ── Zoznam existujúcich tréningov ─────────────────────────────────────────────

def list_garmin_workouts(client):
    """Vypíše tréningy uložené v Garmin Connect."""
    print("\n  📋 Sťahujem zoznam tréningov...")

    try:
        result = _garmin_get(client, f"{WORKOUT_SERVICE}s?start=0&limit=50")

        if not result:
            print("  Žiadne tréningy nenájdené.")
            return

        workouts = result if isinstance(result, list) else result.get("workouts", [])

        print(f"\n  Nájdených {len(workouts)} tréningov:\n")
        print(f"  {'ID':<15} {'Dátum':<12} {'Názov'}")
        print(f"  {'─'*15} {'─'*12} {'─'*30}")

        for w in workouts[:20]:
            wid = str(w.get("workoutId", ""))
            wname = w.get("workoutName", "")[:35]
            wdate = str(w.get("updatedDate", ""))[:10]
            print(f"  {wid:<15} {wdate:<12} {wname}")

        if len(workouts) > 20:
            print(f"\n  ... a ďalších {len(workouts) - 20} tréningov.")

    except RuntimeError as e:
        print(f"  ❌ Chyba: {e}")
