// Klasifikácia typu Hanson behu z názvu tréningu → farebný badge + 1-vetné "Prečo".
// Používa sa v Pláne aj v Generátore, aby UX bolo konzistentné.

export type WorkoutType = "speed" | "strength" | "tempo" | "long" | "easy" | "rest" | "other";

interface TypeStyle {
  label: string;
  badge: string; // tailwind triedy pre badge (bg + text + border)
  why: string; // krátke vysvetlenie účelu (Hanson)
}

const STYLES: Record<WorkoutType, TypeStyle> = {
  speed: {
    label: "Speed",
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    why: "Rýchlostné intervaly @ aktuálne 5k tempo — rozvoj VO2max a bežeckej ekonomiky.",
  },
  strength: {
    label: "Strength",
    badge: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    why: "Dlhé intervaly @ HMP − 6 s/km — sila a odolnosť na pretekové tempo.",
  },
  tempo: {
    label: "Tempo",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    why: "Beh na cieľovom polmaratónovom tempe — telo si zvyká na pretekové úsilie.",
  },
  long: {
    label: "Dlhý",
    badge: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    why: "Dlhý beh v Easy tempe — vytrvalosť a kumulovaná únava (nie pretekové tempo).",
  },
  easy: {
    label: "Easy",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    why: "Regeneračný beh v Easy tempe — aeróbna adaptácia, nie výkon. Nebehaj rýchlo!",
  },
  rest: {
    label: "Voľno",
    badge: "bg-gray-500/15 text-gray-300 border-gray-500/30",
    why: "Odpočinok alebo cross-training — priestor na regeneráciu.",
  },
  other: {
    label: "Beh",
    badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    why: "",
  },
};

export function classifyWorkout(name: string): TypeStyle & { type: WorkoutType } {
  const t = (name || "").toLowerCase();
  let type: WorkoutType = "other";
  if (/strength|sila/.test(t)) type = "strength";
  else if (/speed|rýchl|šprint|šprint|interval/.test(t)) type = "speed";
  else if (/tempo/.test(t)) type = "tempo";
  else if (/long|dlh/.test(t)) type = "long";
  else if (/easy|regenerač|rozbeh|voľný klus/.test(t)) type = "easy";
  else if (/rest|voľno|odpočinok/.test(t)) type = "rest";
  return { type, ...STYLES[type] };
}
