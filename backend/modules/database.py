import os
import time
import threading
import datetime
from supabase import create_client, Client
from cryptography.fernet import Fernet
from typing import Optional, Dict, Any

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None

# ── Krátke in-process cache pre auth/profil ───────────────────────────────────
# verify_token aj get_user_profile sa volajú viackrát na KAŽDÝ request (auth gate +
# get_client + samotný endpoint). Bez cache to je niekoľko Supabase okružných ciest
# navyše na každé volanie. JWT je stabilný (~1 h platnosť), profil sa mení zriedka.
_TOKEN_TTL_SEC = 5 * 60
_PROFILE_TTL_SEC = 60
_token_cache: Dict[str, Any] = {}          # token -> (user, timestamp)
_profile_cache: Dict[str, Any] = {}        # user_id -> (profile, timestamp)
_cache_lock = threading.Lock()


def ping() -> bool:
    """Lacný dotaz do Supabase — drží projekt „aktívny".

    Free tier uspí projekt po ~7 dňoch nečinnosti a appka potom hlási chybu spojenia
    pri prihlásení. Monitor (UptimeRobot) sa na Supabase nedá namieriť priamo: na Free
    pláne posiela HEAD a Supabase naň odpovie 405. Preto Supabase „budíme" odtiaľto,
    z /keepalive, ktorý monitor volá tak či tak.
    """
    if not supabase:
        return False
    try:
        supabase.table("profiles").select("id").limit(1).execute()
        return True
    except Exception as e:
        print(f"⚠️  Supabase ping zlyhal: {e}")
        return False


def _invalidate_profile_cache(user_id: str) -> None:
    with _cache_lock:
        _profile_cache.pop(user_id, None)

def encrypt_password(password: str) -> str:
    if not ENCRYPTION_KEY:
        raise Exception("ENCRYPTION_KEY not set")
    f = Fernet(ENCRYPTION_KEY.encode())
    return f.encrypt(password.encode()).decode()

def decrypt_password(encrypted_password: str) -> str:
    if not ENCRYPTION_KEY:
        raise Exception("ENCRYPTION_KEY not set")
    f = Fernet(ENCRYPTION_KEY.encode())
    return f.decrypt(encrypted_password.encode()).decode()

def get_user_profile(user_id: str) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    now = time.time()
    with _cache_lock:
        hit = _profile_cache.get(user_id)
        if hit and (now - hit[1]) < _PROFILE_TTL_SEC:
            # KÓPIA, nie zdieľaný objekt: volajúci (GET /api/profile) z profilu odstraňuje
            # `garmin_password_encrypted` a `garmin_tokens`. Bez kópie tá mutácia zasiahla
            # priamo cache a na celý TTL — a get_client() potom hlásil „V profile chýbajú
            # prihlasovacie údaje do Garminu“, hoci uložené boli.
            return dict(hit[0]) if isinstance(hit[0], dict) else hit[0]
    res = supabase.table('profiles').select('*').eq('id', user_id).execute()
    profile = res.data[0] if res.data else None
    with _cache_lock:
        _profile_cache[user_id] = (profile, time.time())
    return dict(profile) if isinstance(profile, dict) else profile

def update_user_profile(user_id: str, data: Dict[str, Any]):
    if not supabase:
        return None
    # We use upsert so it creates the profile if it doesn't exist
    data['id'] = user_id
    res = supabase.table('profiles').upsert(data).execute()
    # Profil sa zmenil → zahoď cache, nech ďalšie čítanie vráti čerstvé dáta
    _invalidate_profile_cache(user_id)
    return res.data

def verify_token(token: str):
    """
    Verifies the JWT token from the client by calling Supabase auth.getUser().
    Krátky cache (token -> user) šetrí Supabase auth volanie na každom requeste.
    """
    if not supabase:
        return None
    now = time.time()
    with _cache_lock:
        hit = _token_cache.get(token)
        if hit and (now - hit[1]) < _TOKEN_TTL_SEC:
            return hit[0]
    try:
        res = supabase.auth.get_user(token)
        user = res.user
        if user:
            with _cache_lock:
                _token_cache[token] = (user, time.time())
                # Jednoduchá ochrana pred nekonečným rastom (dlho bežiaci proces)
                if len(_token_cache) > 256:
                    cutoff = time.time() - _TOKEN_TTL_SEC
                    for k in [k for k, v in _token_cache.items() if v[1] < cutoff]:
                        _token_cache.pop(k, None)
        return user
    except Exception as e:
        print(f"Token verification error: {e}")
        return None


def get_garmin_snapshot(user_id: str) -> Optional[Dict[str, Any]]:
    """Vráti dnešný cache snapshot Garmin dát ({data, fetched_at}) alebo None."""
    if not supabase:
        return None
    try:
        today = datetime.date.today().isoformat()
        res = (
            supabase.table("garmin_snapshots")
            .select("data,fetched_at")
            .eq("user_id", user_id)
            .eq("date", today)
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"Snapshot read error: {e}")
        return None


def save_garmin_snapshot(user_id: str, data: Dict[str, Any]):
    """Uloží/aktualizuje dnešný snapshot (upsert podľa user_id+date)."""
    if not supabase:
        return
    try:
        supabase.table("garmin_snapshots").upsert(
            {
                "user_id": user_id,
                "date": datetime.date.today().isoformat(),
                "data": data,
                "fetched_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            },
            on_conflict="user_id,date",
        ).execute()
    except Exception as e:
        print(f"Snapshot save error: {e}")


def save_metric_history(user_id: str, vo2max=None, resting_hr=None, ac_ratio=None, hrv=None):
    """Zaznamená denné kľúčové ukazovatele formy (upsert podľa user_id+date)."""
    if not supabase:
        return
    row = {
        "user_id": user_id,
        "date": datetime.date.today().isoformat(),
        "vo2max": vo2max,
        "resting_hr": resting_hr,
        "ac_ratio": ac_ratio,
        "hrv": hrv,
    }
    try:
        supabase.table("metric_history").upsert(row, on_conflict="user_id,date").execute()
    except Exception:
        # Stĺpec `hrv` ešte nemusí existovať (chýba migrácia) — skús zápis bez neho
        try:
            row.pop("hrv", None)
            supabase.table("metric_history").upsert(row, on_conflict="user_id,date").execute()
        except Exception as e:
            print(f"Metric history save error: {e}")


def get_metric_history(user_id: str, days: int = 90) -> list:
    """Vráti históriu ukazovateľov (vo2max/resting_hr/ac_ratio/hrv) za posledných N dní, vzostupne."""
    if not supabase:
        return []
    since = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()

    def _query(cols: str):
        return (
            supabase.table("metric_history")
            .select(cols)
            .eq("user_id", user_id)
            .gte("date", since)
            .order("date")
            .execute()
        )

    try:
        return _query("date,vo2max,resting_hr,ac_ratio,hrv").data or []
    except Exception:
        # Stĺpec `hrv` ešte nemusí existovať — načítaj bez neho (nech trendy nespadnú)
        try:
            return _query("date,vo2max,resting_hr,ac_ratio").data or []
        except Exception as e:
            print(f"Metric history read error: {e}")
            return []


def get_memory_facts(user_id: str) -> list:
    """Vráti štruktúrované fakty pamäte trénera (id, category, content) pre používateľa."""
    if not supabase:
        return []
    try:
        res = (
            supabase.table("athlete_memory")
            .select("id,category,content,created_at")
            .eq("user_id", user_id)
            .order("created_at")
            .execute()
        )
        return res.data or []
    except Exception as e:
        print(f"Memory read error: {e}")
        return []


def add_memory_fact(user_id: str, content: str, category: str = "note") -> Optional[Dict[str, Any]]:
    """Pridá jeden fakt do pamäte trénera. Vráti vložený riadok."""
    if not supabase:
        return None
    try:
        res = supabase.table("athlete_memory").insert(
            {"user_id": user_id, "category": category or "note", "content": content}
        ).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"Memory add error: {e}")
        return None


def delete_memory_fact(user_id: str, fact_id: str):
    """Vymaže fakt pamäte (len vlastný riadok)."""
    if not supabase:
        return
    try:
        supabase.table("athlete_memory").delete().eq("user_id", user_id).eq("id", fact_id).execute()
    except Exception as e:
        print(f"Memory delete error: {e}")


def log_plan_change(user_id: str, action: str, origin: str, workout_date=None,
                    workout_title: Optional[str] = None, sos_kind: Optional[str] = None,
                    reason: Optional[str] = None):
    """Zapíše jednu zmenu plánu do denníka (fail-open — appka funguje aj bez tabuľky).
    action: recompute|skip|cancel|move|create. origin: button|chat."""
    if not supabase:
        return
    try:
        supabase.table("plan_change_log").insert({
            "user_id": user_id,
            "action": action,
            "origin": origin,
            "workout_date": str(workout_date)[:10] if workout_date else None,
            "workout_title": (workout_title or "")[:200] or None,
            "sos_kind": sos_kind,
            "reason": (reason or "").strip()[:500] or None,
        }).execute()
    except Exception as e:
        print(f"Plan change log error: {e}")


def get_plan_changes(user_id: str, days: int = 28) -> list:
    """Posledné zmeny plánu používateľa (najnovšie prvé). Fail-open."""
    if not supabase:
        return []
    try:
        cutoff = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
        res = (
            supabase.table("plan_change_log")
            .select("id,workout_date,workout_title,sos_kind,action,origin,reason,created_at")
            .eq("user_id", user_id)
            .gte("created_at", cutoff)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return res.data or []
    except Exception as e:
        print(f"Plan changes read error: {e}")
        return []
