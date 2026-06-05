from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import datetime
import os
import sys
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import google.generativeai as genai
from dotenv import load_dotenv

# Load env variables
load_dotenv()

# Add modules to path so we can reuse them
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from modules.auth import get_client
from modules import fetcher
from modules.database import verify_token, get_user_profile, update_user_profile, encrypt_password

app = FastAPI(title="Hansons Running Coach API", version="1.0.0")
security = HTTPBearer()

# Allow CORS for local dev and frontend deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup Gemini AI
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Models
class ChatRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = []

class ProfileUpdate(BaseModel):
    garmin_email: Optional[str] = None
    garmin_password: Optional[str] = None
    target_time: Optional[str] = None

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid authentication token")
    return user.id

def get_garmin_client(user_id: str = Depends(get_current_user)):
    try:
        client = get_client(user_id)
        return client
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Garmin Authentication failed: {str(e)}")

@app.get("/")
def read_root():
    return {"status": "ok", "app": "Hansons Running Coach"}

@app.get("/api/profile")
def get_profile(user_id: str = Depends(get_current_user)):
    profile = get_user_profile(user_id)
    if not profile:
        return {"id": user_id, "garmin_email": None, "target_time": None}
    
    # Hide password in response
    if "garmin_password_encrypted" in profile:
        del profile["garmin_password_encrypted"]
        
    return profile

@app.post("/api/profile")
def update_profile(req: ProfileUpdate, user_id: str = Depends(get_current_user)):
    update_data = {}
    if req.garmin_email:
        update_data["garmin_email"] = req.garmin_email
    if req.garmin_password:
        update_data["garmin_password_encrypted"] = encrypt_password(req.garmin_password)
    if req.target_time:
        update_data["target_time"] = req.target_time
        
    updated = update_user_profile(user_id, update_data)
    return {"status": "success", "profile": updated}

@app.get("/api/dashboard/today")
def get_dashboard_today(client = Depends(get_garmin_client)):
    """Returns today's data (Sleep, HRV, Body Battery, Stress, Readiness)"""
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.datetime.now() - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    
    try:
        sleep = fetcher.get_sleep_data(client, today)
        hrv = fetcher.get_hrv_data(client, today)
        stats = fetcher.get_stats_summary(client, today)
        readiness = fetcher.get_training_readiness(client, today)
        activities = fetcher.get_recent_activities(client, limit=5)
        
        # Format the data cleanly for frontend
        return {
            "date": today,
            "sleep": sleep,
            "hrv": hrv,
            "stats": stats,
            "readiness": readiness,
            "activities": activities
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/plan/scheduled")
def get_scheduled_plan(client = Depends(get_garmin_client)):
    """Gets scheduled workouts from the Garmin calendar"""
    now = datetime.datetime.now()
    try:
        scheduled = client.get_scheduled_workouts(now.year, now.month)
        # Handle dict or list return type from garminconnect
        if isinstance(scheduled, dict):
            items = scheduled.get('calendarItems', scheduled.get('workoutScheduledDTOList', []))
        else:
            items = scheduled or []
        
        return {"workouts": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
def chat_with_coach(req: ChatRequest, user_id: str = Depends(get_current_user)):
    """Communicates with Gemini AI acting as the running coach"""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")
        
    # Get user profile for customized prompt
    profile = get_user_profile(user_id)
    target_time = profile.get("target_time", "neuvedený") if profile else "neuvedený"
    
    system_instruction = (
        f"You are Maros's (and other users') personal AI running coach. "
        f"You follow the Hansons Advanced Half-Marathon method strictly. "
        f"The user's goal time is {target_time}. "
        f"Always be encouraging, professional, and speak in Slovak. "
        f"Keep responses concise and suitable for a mobile app chat interface."
    )
    
    try:
        model = genai.GenerativeModel(
            model_name="gemini-1.5-pro",
            system_instruction=system_instruction
        )
        
        # Convert history
        formatted_history = []
        for msg in req.history:
            role = "user" if msg["role"] == "user" else "model"
            formatted_history.append({"role": role, "parts": [msg["content"]]})
            
        chat = model.start_chat(history=formatted_history)
        response = chat.send_message(req.message)
        
        return {"response": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
