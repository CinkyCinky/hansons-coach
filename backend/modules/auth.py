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
import time
import threading
from pathlib import Path
from modules.database import get_user_profile, decrypt_password, update_user_profile

# Token cache dir — per user_id
CACHE_DIR = Path("/tmp/garmin_cache") if sys.platform != "win32" else Path.home() / ".garmin_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ── In-process cache autentifikovaného Garmin klienta (per user_id) ───────────
# Bez neho sa pri KAŽDOM requeste znova skladal klient a robil živý get_full_name()
# do Garminu len na overenie session (~1–2 sieťové cesty réžie navyše na každé volanie).
# Session z tokenov žije dlho (OAuth1 ~1 rok), takže 10-min cache je bezpečná; pri
# expirácii sa na cache-miss aj tak spraví čerstvý login.
_CLIENT_TTL_SEC = 10 * 60
_client_cache: dict = {}          # user_id -> (client, timestamp)
_client_lock = threading.Lock()


def invalidate_client(user_id: str) -> None:
    """Zahodí cachovaného klienta (napr. po zlyhaní session) — ďalší request ho poskladá nanovo."""
    with _client_lock:
        _client_cache.pop(user_id, None)


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
    Priorita: in-process cache → Supabase tokeny → fresh login.
    """
    # KROK 0: Živý klient v pamäti? (ušetrí Supabase profil + login + sieťovú réžiu)
    now = time.time()
    with _client_lock:
        hit = _client_cache.get(user_id)
        if hit and (now - hit[1]) < _CLIENT_TTL_SEC:
            return hit[0]

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

    # KROK 2: Skús použiť uložené tokeny. login(tokenstore) sám obnoví expirovaný OAuth token,
    # takže je to dostatočná validácia — samostatný get_full_name() probe je zbytočná sieťová cesta.
    client = None
    if token_store.exists() and any(token_store.iterdir()):
        try:
            client = Garmin()
            client.login(tokenstore=str(token_store))
        except Exception:
            client = None  # Token expiroval / neplatný — ideme na fresh login

    # KROK 3: Fresh login s email/password (ak tokeny zlyhali)
    if client is None:
        try:
            client = Garmin(email=email, password=password)
            client.login()

            # Ulož tokeny na disk
            token_store.mkdir(parents=True, exist_ok=True)
            client.client.dump(str(token_store))

            # A hneď aj do Supabase pre persistenciu cez restarty
            _save_tokens_to_supabase(user_id, token_store)
        except Exception as e:
            raise Exception(f"Chyba prihlásenia do Garminu: {e}")

    with _client_lock:
        _client_cache[user_id] = (client, time.time())
    return client
