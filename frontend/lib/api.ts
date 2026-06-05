import { createClient } from './supabase/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  const headers = new Headers(options.headers);
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }
  
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });
  
  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errBody = await res.json();
      if (errBody && errBody.detail) errorDetail = errBody.detail;
    } catch (e) {}
    throw new Error(`${errorDetail}`);
  }
  return res.json();
}

export async function fetchDashboard() {
  return fetchWithAuth('/api/dashboard/today');
}

export async function fetchDashboardAdvice(metrics: any) {
  return fetchWithAuth('/api/dashboard/advice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metrics)
  });
}

export async function fetchScheduledPlan() {
  return fetchWithAuth('/api/plan/scheduled');
}

export async function generatePlan(constraints: string) {
  return fetchWithAuth('/api/plan/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ constraints })
  });
}

export async function uploadPlan(plan_data: any) {
  return fetchWithAuth('/api/plan/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_data })
  });
}

export async function fetchProfile() {
  return fetchWithAuth('/api/profile');
}

export async function updateProfile(data: any) {
  return fetchWithAuth('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function sendChatMessage(message: string, history: any[] = []) {
  return fetchWithAuth('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history })
  });
}
