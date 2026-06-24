// Hodnotenie odbehnutého behu — krátka správa „ako si ho zabehol a aký mal prínos".
// Deterministické (žiadne AI volanie pri každom rozkliknutí): spája typ tréningu
// (Hanson), rozloženie HR zón a tréningový efekt z Garminu.

import { classifyWorkout } from "./workoutType";

// Garmin trainingEffectLabel → slovenský názov
const TE_LABEL_SK: Record<string, string> = {
  RECOVERY: "Regenerácia",
  BASE: "Aeróbna báza",
  AEROBIC_BASE: "Aeróbna báza",
  TEMPO: "Tempo",
  THRESHOLD: "Laktátový prah",
  LACTATE_THRESHOLD: "Laktátový prah",
  VO2MAX: "VO2max",
  ANAEROBIC: "Anaeróbny výkon",
  ANAEROBIC_CAPACITY: "Anaeróbna kapacita",
  SPEED: "Rýchlosť",
  SPRINT: "Šprint",
  MAINTAINING: "Udržiavanie",
  NO_BENEFIT: "Bez prínosu",
};

export function teLabelSk(label?: string | null): string | null {
  if (!label) return null;
  return TE_LABEL_SK[label.toUpperCase()] ?? null;
}

export interface RunInsight {
  note: string;
  tone: "good" | "warn" | "info";
}

interface RunStats {
  hr_zones?: { zone: number; pct: number }[];
  aerobic_te?: number | null;
  anaerobic_te?: number | null;
}

export function runInsight(title: string, stats: RunStats | null | undefined): RunInsight | null {
  const zones = stats?.hr_zones;
  if (!zones || !zones.length) return null;

  const pct = (n: number) => zones.find((z) => z.zone === n)?.pct ?? 0;
  const easy = pct(1) + pct(2);          // ľahké zóny Z1–Z2
  const hard = pct(3) + pct(4) + pct(5); // stredné a vyššie
  const type = classifyWorkout(title).type;

  // Easy / dlhý / regeneračný beh — má byť prevažne v Z1–Z2
  if (type === "easy" || type === "long" || type === "rest") {
    if (easy >= 75)
      return { tone: "good", note: "Pekne ľahko — väčšina času v Z1–Z2. Presne takto má vyzerať Easy/dlhý beh: buduješ aeróbnu bázu a regeneruješ." };
    if (easy >= 55)
      return { tone: "info", note: "Mierne rýchlejšie — časť behu si bol v Z3. Na regeneračný beh skús nabudúce o čosi spomaliť (Z1–Z2)." };
    return { tone: "warn", note: `Na regeneračný beh privysoko — len ${easy}% času v Z1–Z2, zvyšok v Z3+. Easy behy maj naozaj ľahké, inak narúšajú regeneráciu (jadrom Hansona je kumulovaná únava, nie každodenná tvrdosť).` };
  }

  // Kvalitné tréningy (speed/strength/tempo) + ostatné behy
  const isSos = type === "speed" || type === "strength" || type === "tempo";
  let note = `${isSos ? "Kvalitný tréning" : "Tréning"} — ${hard}% času v Z3–Z5.`;
  if (stats?.aerobic_te) note += ` Aeróbny efekt ${Number(stats.aerobic_te).toFixed(1)}/5 (rozvoj vytrvalosti a kondície).`;
  if (stats?.anaerobic_te && stats.anaerobic_te >= 1)
    note += ` Anaeróbny ${Number(stats.anaerobic_te).toFixed(1)}/5 (rozvoj rýchlosti a výkonu).`;
  return { tone: "good", note };
}
