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
