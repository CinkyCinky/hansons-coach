// Preklad Garmin štítkov do slovenčiny.
// Garmin API vracia HRV stav v angličtine (BALANCED, LOW…) — pre začiatočníka
// nezrozumiteľné, tak ho prekladáme na jednom mieste (Reports aj Prehľad).

const HRV_STATUS_SK: Record<string, string> = {
  BALANCED: "Vyvážené",
  UNBALANCED: "Nevyvážené",
  LOW: "Nízke",
  POOR: "Slabé",
  UNKNOWN: "--",
};

export function hrvStatusSk(s?: string | null): string {
  if (!s) return "--";
  return HRV_STATUS_SK[s.toUpperCase()] ?? s;
}

// Garmin „Training Readiness" vracia úroveň v angličtine (HIGH, LOW…) — prekladáme na SK.
const READINESS_LEVEL_SK: Record<string, string> = {
  VERY_LOW: "Veľmi nízka",
  LOW: "Nízka",
  MODERATE: "Stredná",
  HIGH: "Vysoká",
  VERY_HIGH: "Veľmi vysoká",
  MAXED: "Maximálna",
  PRIME: "Špičková",
  READY: "Pripravený",
  NONE: "--",
  UNKNOWN: "--",
};

export function readinessLevelSk(s?: string | null): string {
  if (!s) return "";
  return READINESS_LEVEL_SK[s.toUpperCase()] ?? s;
}
