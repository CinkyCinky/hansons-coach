"""
routers/garmin.py — Garmin Connect authentication endpoints

Handles login with email/password, token persistence, and connection status.
Tokens are stored in ~/.garmin_hanson_coach (same as garmin_tools).
"""

import sys
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# Ensure garmin_tools is on path (set by main.py, but guard here too)
GARMIN_TOOLS_PATH = Path(__file__).parent.parent.parent.parent / "garmin_tools"
if str(GARMIN_TOOLS_PATH) not in sys.path:
    sys.path.insert(0, str(GARMIN_TOOLS_PATH))

# Token store path — same as auth.py
TOKEN_STORE = Path.home() / ".garmin_hanson_coach"

router = APIRouter()


class GarminLoginRequest(BaseModel):
    email: str
    password: str
    mfa_code: Optional[str] = None


class GarminLoginResponse(BaseModel):
    success: bool
    message: str
    name: Optional[str] = None


def _get_garmin_client():
    """Return an authenticated Garmin client using stored tokens, or raise."""
    try:
        from garminconnect import Garmin
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="garminconnect library is not installed. Run: pip install garminconnect",
        )

    if TOKEN_STORE.exists() and any(TOKEN_STORE.iterdir()):
        try:
            client = Garmin()
            client.login(tokenstore=str(TOKEN_STORE))
            return client
        except Exception as e:
            raise HTTPException(
                status_code=401,
                detail=f"Stored session expired. Please login again. ({e})",
            )

    raise HTTPException(
        status_code=401,
        detail="Not authenticated. Please POST /garmin/login first.",
    )


@router.post("/login", response_model=GarminLoginResponse)
async def garmin_login(body: GarminLoginRequest):
    """
    Authenticate with Garmin Connect using email/password.
    Tokens are saved to ~/.garmin_hanson_coach for reuse.
    """
    try:
        from garminconnect import Garmin, GarminConnectAuthenticationError
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="garminconnect library is not installed.",
        )

    def _mfa_prompt() -> str:
        # For API use the mfa_code field if provided; otherwise returns empty
        return body.mfa_code or ""

    try:
        client = Garmin(
            email=body.email,
            password=body.password,
            prompt_mfa=_mfa_prompt,
        )
        client.login()

        # Persist tokens
        TOKEN_STORE.mkdir(parents=True, exist_ok=True)
        client.client.dump(str(TOKEN_STORE))

        name = client.get_full_name()
        return GarminLoginResponse(
            success=True,
            message="Successfully logged in to Garmin Connect",
            name=name,
        )

    except Exception as e:
        err = str(e)
        if "429" in err or "rate limit" in err.lower():
            raise HTTPException(
                status_code=429,
                detail="Garmin is temporarily blocking your IP (rate limit). Wait 10–15 minutes.",
            )
        raise HTTPException(status_code=401, detail=f"Authentication failed: {err}")


@router.get("/status")
async def garmin_status():
    """Check if Garmin session tokens exist and are valid."""
    if not TOKEN_STORE.exists():
        return {"authenticated": False, "reason": "No token store found"}

    try:
        entries = list(TOKEN_STORE.iterdir())
    except Exception:
        return {"authenticated": False, "reason": "Cannot read token store"}

    if not entries:
        return {"authenticated": False, "reason": "Token store is empty"}

    try:
        from garminconnect import Garmin
        client = Garmin()
        client.login(tokenstore=str(TOKEN_STORE))
        name = client.get_full_name()
        return {"authenticated": True, "name": name}
    except Exception as e:
        return {"authenticated": False, "reason": f"Session expired: {e}"}


@router.delete("/logout")
async def garmin_logout():
    """Remove stored Garmin tokens."""
    import shutil
    if TOKEN_STORE.exists():
        shutil.rmtree(str(TOKEN_STORE), ignore_errors=True)
    return {"success": True, "message": "Logged out — tokens removed"}
