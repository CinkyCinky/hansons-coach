// Hanson tréningové tempá z cieľového času.
// ZRKADLÍ backend: modules/hansons_knowledge.py → compute_training_paces.
// Tempo (HMP), Easy a Strength sú čisté funkcie cieľa — počítame ich presne tak
// ako backend. Speed závisí od AKTUÁLNEJ formy (Garmin VO2max), preto ho tu vieme
// dať len orientačne (rovnaký fallback z cieľa ako backend, keď VO2max chýba).

function parseGoalToSec(t: string): number | null {
  const parts = String(t).trim().split(":").map(Number);
  if (!parts.length || parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

export interface TrainingPaces {
  tempo: string;       // = HMP (pretekové tempo)
  easyMin: string;     // rýchlejší okraj Easy
  easyMax: string;     // pomalší okraj Easy
  strength: string;    // Strength intervaly
  speedApprox: string; // Speed — len orientačne z cieľa (reálne z VO2max)
}

export function computePaces(goalTime: string): TrainingPaces | null {
  const total = parseGoalToSec(goalTime);
  if (!total) return null;
  const hmp = Math.round(total / 21.0975);   // Half Marathon Pace (s/km) = Tempo
  const strength = hmp - 6;                   // Strength = HMP − 10 s/míľu (≈ −6 s/km)
  const speed = Math.min(hmp - 22, strength - 5); // fallback z cieľa (ako backend)
  return {
    tempo: fmt(hmp),
    easyMin: fmt(hmp + 40),
    easyMax: fmt(hmp + 75),
    strength: fmt(strength),
    speedApprox: fmt(speed),
  };
}
