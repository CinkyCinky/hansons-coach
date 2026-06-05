const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchDashboard() {
  const res = await fetch(`${API_URL}/api/dashboard/today`);
  if (!res.ok) throw new Error('Failed to fetch dashboard data');
  return res.json();
}

export async function fetchScheduledPlan() {
  const res = await fetch(`${API_URL}/api/plan/scheduled`);
  if (!res.ok) throw new Error('Failed to fetch scheduled plan');
  return res.json();
}

export async function sendChatMessage(message: string, history: any[] = []) {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, history }),
  });
  
  if (!res.ok) throw new Error('Failed to send message');
  return res.json();
}
