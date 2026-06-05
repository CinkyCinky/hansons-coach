from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import datetime
import os
import sys
import google.generativeai as genai
from dotenv import load_dotenv

# Load env variables
load_dotenv()

# Add modules to path so we can reuse them
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from modules.auth import get_client
from modules import fetcher

app = FastAPI(title="Hansons Running Coach API", version="1.0.0")

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

def get_garmin_client():
    try:
        client = get_client()
        return client
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Garmin Authentication failed: {str(e)}")

@app.get("/")
def read_root():
    return {"status": "ok", "app": "Hansons Running Coach"}

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
def chat_with_coach(req: ChatRequest):
    """Communicates with Gemini AI acting as the running coach"""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")
        
    system_instruction = (
        "You are Maros's personal AI running coach. "
        "You follow the Hansons Advanced Half-Marathon method strictly. "
        "Maros's goal time is 1:50:00 (HMP 5:13/km, Easy 6:30-7:30/km). "
        "Always be encouraging, professional, and speak in Slovak. "
        "Keep responses concise and suitable for a mobile app chat interface."
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
