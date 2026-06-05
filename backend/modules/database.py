import os
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
