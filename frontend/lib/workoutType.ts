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
    // VO2max a „ekonomika“ sú pre nováčika prázdne slová, preto ich rovno v zátvorke vysvetlíme.
    why: "Krátke rýchle intervaly na tvojom aktuálnom 5 km tempe — dvíhajú VO2max (koľko kyslíka telo dokáže využiť) aj bežeckú ekonomiku (koľko ťa stojí energie jeden kilometer).",
  },
  strength: {
    label: "Strength",
    badge: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    why: "Dlhé intervaly o 6 s/km rýchlejšie než cieľové pretekové tempo (HMP) — sila a schopnosť držať tempo na unavených nohách.",
  },
  tempo: {
    label: "Tempo",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    why: "Súvislý beh presne na cieľovom pretekovom tempe (HMP) — telo si zvyká na pretekové úsilie.",
  },
  long: {
    label: "Dlhý",
    badge: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    why: "Najdlhší beh týždňa v ľahkom (Easy) tempe — vytrvalosť a kumulovaná únava, nie pretekové tempo.",
  },
  easy: {
    label: "Easy",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    // Pôvodné „len regenerácia“ odporovalo kap. 1.1 metodiky — Easy je zároveň nositeľ objemu.
    why: "Ľahký beh — neslúži len na regeneráciu, buduje aj objem a kumulovanú únavu, jadro metódy. Nebehaj rýchlo!",
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
  // `\btempo\b` (+ prídavné meno „tempový“) zámerne NEchytí inštrumentál „tempom“ ani
  // lokál „tempe“ — inak sa „Easy beh 10 km pokojným tempom“ vyhodnotí ako kľúčový
  // tempový tréning: dostane žltý odznak a zaráta sa do vynechaných SOS.
  else if (/\btempo\b|\btempov/.test(t)) type = "tempo";
  else if (/long|dlh/.test(t)) type = "long";
  else if (/easy|regenerač|rozbeh|voľný klus/.test(t)) type = "easy";
  else if (/rest|voľno|odpočinok/.test(t)) type = "rest";
  return { type, ...STYLES[type] };
}
