import os
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
    res = supabase.table('profiles').select('*').eq('id', user_id).execute()
    if len(res.data) > 0:
        return res.data[0]
    return None

def update_user_profile(user_id: str, data: Dict[str, Any]):
    if not supabase:
        return None
    # We use upsert so it creates the profile if it doesn't exist
    data['id'] = user_id
    res = supabase.table('profiles').upsert(data).execute()
    return res.data

def verify_token(token: str):
    """
    Verifies the JWT token from the client by calling Supabase auth.getUser()
    """
    if not supabase:
        return None
    try:
        res = supabase.auth.get_user(token)
        return res.user
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
