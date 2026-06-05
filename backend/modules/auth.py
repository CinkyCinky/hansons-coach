"""
modules/auth.py — Garmin Connect Autentifikacia (garminconnect 0.3.5+)
"""

import sys
import getpass
from pathlib import Path

from pathlib import Path
from modules.database import get_user_profile, decrypt_password

# Use a directory to store tokens per user
CACHE_DIR = Path("/tmp/garmin_cache") if sys.platform != "win32" else Path.home() / ".garmin_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

def get_client(user_id: str):
    """
    Vrati autentifikovaneho Garmin klienta pre dany user_id z databazy.
    """
    try:
        from garminconnect import Garmin
    except ImportError:
        print("CHYBA: Kniiznica garminconnect nie je nainstalovana.")
        sys.exit(1)

    profile = get_user_profile(user_id)
    if not profile or not profile.get("garmin_email") or not profile.get("garmin_password_encrypted"):
        raise Exception("V profile chýbajú prihlasovacie údaje do Garminu.")

    email = profile["garmin_email"]
    password = decrypt_password(profile["garmin_password_encrypted"])
    token_store = CACHE_DIR / f"{user_id}_tokens"

    # Skus nacitat ulozene tokeny
    if token_store.exists() and any(token_store.iterdir()):
        try:
            client = Garmin()
            client.login(tokenstore=str(token_store))
            return client
        except Exception as e:
            pass # token vyprsal, pokracujeme na fresh login

    # Fresh login
    try:
        client = Garmin(email=email, password=password)
        client.login()
        # Uloz tokeny do cache pre buduce pouzitie (do dalseho restartu servera)
        token_store.mkdir(parents=True, exist_ok=True)
        client.client.dump(str(token_store))
        return client
    except Exception as e:
        raise Exception(f"Chyba prihlasenia do Garminu: {e}")


