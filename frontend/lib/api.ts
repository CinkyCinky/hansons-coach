import { createClient } from './supabase/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// FastAPI vracia `detail` ako reťazec (HTTPException) ALEBO ako pole objektov
// (422 validačné chyby: [{loc, msg, type}]) ALEBO ako objekt. Bez normalizácie
// by `new Error(detail)` skončil ako "[object Object]" v UI.
function normalizeDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === 'object' && 'msg' in d ? (d as any).msg : String(d)))
      .filter(Boolean);
    if (msgs.length) return msgs.join('; ');
  }
  if (detail && typeof detail === 'object' && 'msg' in (detail as any)) {
    return String((detail as any).msg);
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return 'Neznáma chyba.';
  }
}

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
      if (errBody?.detail) errorDetail = normalizeDetail(errBody.detail);
    } catch {}
    throw new Error(errorDetail);
  }
  return res.json();
}

// Starý jednoduchý cache nahradený globálnym store (lib/store.tsx)
// Tieto funkcie sú volané zo store-u, nie priamo z komponentov.

export async function fetchDashboard(forceRefresh = false) {
  // forceRefresh (tlačidlo Refresh) obíde aj denný backend cache → čerstvé Garmin dáta
  return fetchWithAuth('/api/dashboard/today' + (forceRefresh ? '?refresh=true' : ''));
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

export async function fetchWeeklyReport(forceRefresh = false) {
  return fetchWithAuth('/api/reports/weekly' + (forceRefresh ? '?refresh=true' : ''));
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

// Kľúč pre dnešný self-report (pocit/bolesť) — zdieľaný s Dashboardom
export const FEELING_KEY = 'hansons_feeling';

export async function fetchDailyUpdateProposal() {
  // Ak má zverenec dnešný self-report (pocit/bolesť), pošli ho do prepočtu
  let qs = '';
  try {
    const raw = localStorage.getItem(FEELING_KEY);
    if (raw) {
      const f = JSON.parse(raw);
      const today = new Date().toISOString().slice(0, 10);
      if (f?.date === today && f?.feeling) {
        const p = new URLSearchParams({ feeling: f.feeling });
        if (f.pain) p.set('pain', f.pain);
        if (f.pain_area) p.set('pain_area', f.pain_area);
        qs = '?' + p.toString();
      }
    }
  } catch { /* localStorage nedostupné — pošli bez self-reportu */ }
  return fetchWithAuth('/api/plan/daily_update' + qs);
}

export async function estimateGoal(raceDistanceKm?: number, raceTime?: string) {
  return fetchWithAuth('/api/plan/goal_estimate', {
    method: 'POST',
    body: JSON.stringify({ race_distance_km: raceDistanceKm ?? null, race_time: raceTime ?? null }),
  });
}

export async function fetchPlanOverview() {
  return fetchWithAuth('/api/plan/overview');
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

export async function fetchMemory() {
  return fetchWithAuth('/api/memory');
}

export async function addMemoryFact(content: string, category = 'note') {
  return fetchWithAuth('/api/memory', {
    method: 'POST',
    body: JSON.stringify({ content, category }),
  });
}

export async function deleteMemoryFact(id: string) {
  return fetchWithAuth(`/api/memory/${id}`, { method: 'DELETE' });
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
