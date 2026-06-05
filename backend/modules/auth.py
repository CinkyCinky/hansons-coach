"""
modules/auth.py — Garmin Connect Autentifikacia (garminconnect 0.3.5+)
"""

import sys
import getpass
from pathlib import Path

TOKEN_STORE = Path.home() / ".garmin_hanson_coach"


def get_client():
    """
    Vrati autentifikovaneho Garmin klienta.
    Najprv skusi ulozene tokeny, potom interaktivne prihlasenie.
    """
    try:
        from garminconnect import Garmin
    except ImportError:
        print("CHYBA: Kniiznica garminconnect nie je nainstalovana.")
        print("Spusti setup.bat")
        sys.exit(1)

    # Skus nacitat ulozene tokeny
    if TOKEN_STORE.exists() and any(TOKEN_STORE.iterdir()):
        try:
            client = Garmin()
            client.login(tokenstore=str(TOKEN_STORE))
            name = client.get_full_name()
            print(f"Prihlaseny ako: {name}")
            return client
        except Exception as e:
            print(f"Ulozena session vyprsala ({e}), prihlasujem znova...")

    return _fresh_login()


def login(force: bool = False):
    """Spusti interaktivne prihlasenie."""
    return _fresh_login()


def _fresh_login():
    """Interaktivne prihlasenie s podporou MFA."""
    try:
        from garminconnect import Garmin, GarminConnectAuthenticationError
    except ImportError:
        print("CHYBA: Kniiznica garminconnect nie je nainstalovana.")
        sys.exit(1)

    print()
    print("=" * 45)
    print("  Prihlasenie do Garmin Connect")
    print("=" * 45)
    print()

    email = input("  Garmin email: ").strip()
    password = getpass.getpass("  Garmin heslo: ")
    print()
    print("  Prihlasujem sa...", end="", flush=True)

    def _mfa_prompt() -> str:
        """Garmin vola tuto funkciu ak potrebuje MFA kod."""
        print()
        print()
        print("  Garmin pozaduje dvojfaktorove overenie.")
        print("  Skontroluj email alebo Garmin aplikaciu.")
        return input("  Zadaj 6-miestny kod: ").strip()

    try:
        client = Garmin(
            email=email,
            password=password,
            prompt_mfa=_mfa_prompt,
        )
        client.login()

        # Uloz tokeny
        TOKEN_STORE.mkdir(parents=True, exist_ok=True)
        client.client.dump(str(TOKEN_STORE))

        name = client.get_full_name()
        print(f"\n  Uspesne prihlaseny ako: {name}")
        print(f"  Tokeny ulozene (dalej uz prihlasenie nebude potrebne).")
        return client

    except GarminConnectAuthenticationError as e:
        err = str(e).lower()
        if "429" in str(e) or "rate limit" in err or "ip rate" in err:
            print("\n")
            print("=" * 55)
            print("  POZOR: Garmin docasne blokuje tvoju IP adresu (429)")
            print()
            print("  Prilis vela pokusov o prihlasenie v kratkom case.")
            print("  Toto je docasne - Garmin to odbloкuje automaticky.")
            print()
            print("  CO ROBIT:")
            print("  1. Pockaj 10-15 minut")
            print("  2. Skus KROK_1_Prihlasit_sa.bat znova")
            print("=" * 55)
        else:
            print(f"\n  CHYBA prihlasenia: {e}")
            print("  Skontroluj email a heslo na garmin.com")
        sys.exit(1)

    except Exception as e:
        err_str = str(e).lower()
        if "429" in str(e) or "rate limit" in err_str or "ip rate" in err_str:
            print("\n")
            print("=" * 55)
            print("  POZOR: Garmin docasne blokuje tvoju IP adresu (429)")
            print()
            print("  CO ROBIT:")
            print("  1. Pockaj 10-15 minut")
            print("  2. Skus KROK_1_Prihlasit_sa.bat znova")
            print("=" * 55)
        else:
            print(f"\n  Neocakavana chyba: {e}")
        sys.exit(1)
