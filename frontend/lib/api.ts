import { createClient } from './supabase/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errBody = await res.json();
      if (errBody?.detail) errorDetail = errBody.detail;
    } catch {}
    throw new Error(errorDetail);
  }
  return res.json();
}

// Starý jednoduchý cache nahradený globálnym store (lib/store.tsx)
// Tieto funkcie sú volané zo store-u, nie priamo z komponentov.

export async function fetchDashboard(forceRefresh = false) {
  // forceRefresh parameter zachovaný pre kompatibilitu, cache riadi store
  return fetchWithAuth('/api/dashboard/today');
}

export async function fetchDashboardAdvice(metrics: any) {
  return fetchWithAuth('/api/dashboard/advice', {
    method: 'POST',
    body: JSON.stringify(metrics),
  });
}

export async function fetchScheduledPlan() {
  return fetchWithAuth('/api/plan/scheduled');
}

export async function fetchWeeklyReport() {
  return fetchWithAuth('/api/reports/weekly');
}

export async function generatePlan(constraints: string) {
  return fetchWithAuth('/api/plan/generate', {
    method: 'POST',
    body: JSON.stringify({ constraints }),
  });
}

export async function uploadPlan(planData: any) {
  return fetchWithAuth('/api/plan/upload', {
    method: 'POST',
    body: JSON.stringify({ plan_data: planData }),
  });
}

export async function fetchDailyUpdateProposal() {
  return fetchWithAuth('/api/plan/daily_update');
}

export async function confirmDailyUpdate(
  workout: any,
  old_workout_id: string,
  target_date_str: string
) {
  return fetchWithAuth('/api/plan/daily_update/confirm', {
    method: 'POST',
    body: JSON.stringify({ workout, old_workout_id, target_date_str }),
  });
}

export async function fetchWorkoutDetails(workoutId: string) {
  return fetchWithAuth(`/api/plan/workout/${workoutId}`);
}

export async function fetchActivityStats(activityId: string) {
  return fetchWithAuth(`/api/plan/activity/${activityId}`);
}

export async function fetchProfile() {
  return fetchWithAuth('/api/profile');
}

export async function updateProfile(data: any) {
  return fetchWithAuth('/api/profile', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function sendChatMessage(
  message: string,
  history: any[] = [],
  model: 'flash' | 'pro' = 'flash'
) {
  const now = new Date();
  const local_time = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  return fetchWithAuth('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history, model, local_time }),
  });
}
