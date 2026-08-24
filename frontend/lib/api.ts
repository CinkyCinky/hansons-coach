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
    throw new ApiError(errorDetail, res.status);
  }
  return res.json();
}

// Chyba z API, ktorá si so sebou nesie HTTP stav. Bez neho museli volajúci hádať typ chyby
// z textu hlášky (hľadanie reťazca „401") — a to zlyhá vždy, keď backend pošle vlastný
// slovenský detail bez čísla, alebo naopak text s číslom 401 v úplne inom význame.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** HTTP stav chyby, ak ho poznáme (inak null). */
export function errorStatus(err: unknown): number | null {
  return err instanceof ApiError ? err.status : null;
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

/** AI zhrnutie týždňa — interpretuje čísla z reportu. Backend odpoveď cachuje na deň. */
export async function fetchWeeklySummary(forceRefresh = false): Promise<{ summary: string | null }> {
  return fetchWithAuth('/api/reports/summary' + (forceRefresh ? '?refresh=true' : ''));
}

/**
 * Overí, či sa appka vie prihlásiť do Garminu uloženými údajmi.
 * Vracia VŽDY HTTP 200 — neúspech je normálny stav, nie chyba servera, aby ho
 * Nastavenia vedeli zobraziť ako zrozumiteľnú radu namiesto červenej výnimky.
 */
export async function checkGarminConnection(): Promise<{
  ok: boolean;
  name?: string | null;
  reason?: 'credentials' | 'mfa' | 'rate_limit' | 'missing' | 'network' | 'unknown';
  message: string;
}> {
  return fetchWithAuth('/api/garmin/check', { method: 'POST' });
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

export async function fetchPlanChanges() {
  return fetchWithAuth('/api/plan/changes');
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

function localTimeStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export async function sendChatMessage(
  message: string,
  history: any[] = [],
  model: 'flash' | 'pro' = 'flash'
) {
  return fetchWithAuth('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history, model, local_time: localTimeStr() }),
  });
}

// Streamovaný chat (SSE). onDelta dostáva postupné časti odpovede, onTool názov práve
// vykonaného nástroja; vráti {model_used, fallback, tools_used}.
// fallback=true znamená, že stream nedal text (napr. len tool-call) → volajúci má dobehnúť
// cez nestreamovaný sendChatMessage — ALE len ak sa nevykonal žiadny nástroj.
// tools_used/onTool: backend je bezstavový, takže zopakovanie tej istej správy by spustilo
// tool-loop odznova a tréning by sa v Garmine vytvoril / presunul / zmazal DRUHÝKRÁT.
export async function streamChatMessage(
  message: string,
  history: any[],
  model: 'flash' | 'pro',
  onDelta: (text: string) => void,
  onTool?: (name: string, write: boolean) => void
): Promise<{ model_used?: string; fallback?: boolean; tools_used?: boolean }> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(`${API_URL}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ message, history, model, local_time: localTimeStr() }),
  });

  if (!res.ok || !res.body) {
    throw new Error('Streamovanie zlyhalo');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: { model_used?: string; fallback?: boolean; tools_used?: boolean } = {};

  // SSE rámce sú oddelené prázdnym riadkom ("\n\n")
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const jsonStr = dataLine.slice(5).trim();
      if (!jsonStr) continue;
      try {
        const evt = JSON.parse(jsonStr);
        if (evt.t) onDelta(evt.t as string);
        // Nástroj sa už VYKONAL. `write` rozlišuje zápis do Garminu (správu nesmieme
        // poslať znova) od obyčajného čítania (opakovanie je bezpečné).
        if ('tool' in evt) onTool?.(String(evt.tool ?? ''), evt.write === true);
        if (evt.done) {
          result = {
            model_used: evt.model_used,
            fallback: evt.fallback,
            tools_used: evt.tools_used === true,
          };
        }
      } catch { /* ignoruj nekompletný/nevalidný rámec */ }
    }
  }
  return result;
}
