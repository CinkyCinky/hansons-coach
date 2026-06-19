"""
modules/auth.py — Garmin Connect Autentifikacia (garminconnect 0.3.5+)

Robustná token persistencia:
  1. Načíta tokeny zo Supabase pri každom volaní
  2. Uloží ich do /tmp pre garminconnect kniznicu
  3. Po úspešnom logine vždy uloží tokeny späť do Supabase
  4. Jeden retry pri expirovanom tokene
"""

import sys
import json
from pathlib import Path
from modules.database import get_user_profile, decrypt_password, update_user_profile

# Token cache dir — per user_id
CACHE_DIR = Path("/tmp/garmin_cache") if sys.platform != "win32" else Path.home() / ".garmin_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _save_tokens_to_supabase(user_id: str, token_store: Path):
    """Uloží tokeny z /tmp späť do Supabase pre trvalú persistenciu."""
    try:
        garth_file = token_store / "garmin_tokens.json"
        if garth_file.exists():
            with open(garth_file, "r") as f:
                tokens_data = json.load(f)
            update_user_profile(user_id, {"garmin_tokens": tokens_data})
    except Exception as e:
        print(f"⚠️  Chyba pri ukladaní tokenov do Supabase: {e}")


def _load_tokens_from_supabase(user_id: str, token_store: Path, profile: dict):
    """Načíta tokeny zo Supabase a uloží ich do /tmp pre kniznicu."""
    db_tokens = profile.get("garmin_tokens")
    if db_tokens:
        try:
            token_store.mkdir(parents=True, exist_ok=True)
            with open(token_store / "garmin_tokens.json", "w") as f:
                json.dump(db_tokens, f)
            return True
        except Exception as e:
            print(f"⚠️  Chyba pri načítaní tokenov z DB: {e}")
    return False


def get_client(user_id: str):
    """
    Vráti autentifikovaného Garmin klienta pre daný user_id.
    Priorita: Supabase tokeny → fresh login.
    """
    try:
        from garminconnect import Garmin
    except ImportError:
        raise Exception("Knižnica garminconnect nie je nainštalovaná.")

    profile = get_user_profile(user_id)
    if not profile or not profile.get("garmin_email") or not profile.get("garmin_password_encrypted"):
        raise Exception("V profile chýbajú prihlasovacie údaje do Garminu. Nastav ich v Nastaveniach.")

    email = profile["garmin_email"]
    password = decrypt_password(profile["garmin_password_encrypted"])
    token_store = CACHE_DIR / f"{user_id}_tokens"

    # KROK 1: Vždy načítaj najnovšie tokeny zo Supabase do /tmp
    _load_tokens_from_supabase(user_id, token_store, profile)

    # KROK 2: Skús použiť uložené tokeny
    if token_store.exists() and any(token_store.iterdir()):
        try:
            client = Garmin()
            client.login(tokenstore=str(token_store))
            # Rýchly test, že session je živá
            client.get_full_name()
            return client
        except Exception:
            # Token expiroval — ideme na fresh login
            pass

    # KROK 3: Fresh login s email/password
    try:
        client = Garmin(email=email, password=password)
        client.login()

        # Ulož tokeny na disk
        token_store.mkdir(parents=True, exist_ok=True)
        client.client.dump(str(token_store))

        # A hneď aj do Supabase pre persistenciu cez restarty
        _save_tokens_to_supabase(user_id, token_store)

        return client
    except Exception as e:
        raise Exception(f"Chyba prihlásenia do Garminu: {e}")
