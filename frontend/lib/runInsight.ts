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
  hr_zones?: { zone: number; pct: number; low?: number | null }[];
  avg_hr?: number | null;
  aerobic_te?: number | null;
  anaerobic_te?: number | null;
}

export function runInsight(title: string, stats: RunStats | null | undefined): RunInsight | null {
  const zones = stats?.hr_zones;
  if (!zones || !zones.length) return null;

  const pct = (n: number) => zones.find((z) => z.zone === n)?.pct ?? 0;
  const lowOf = (n: number) => zones.find((z) => z.zone === n)?.low ?? null;
  const easy = pct(1) + pct(2);          // ľahké zóny Z1–Z2
  const hard = pct(3) + pct(4) + pct(5); // stredné a vyššie
  const type = classifyWorkout(title).type;

  // Easy / dlhý / regeneračný beh.
  // POZOR: podľa Hanson metodiky (a vlastných HR zón appky) je strop Easy behu
  // AERÓBNY PRAH (AeT ≈ 0.86×LTHR), ktorý leží v SPODNEJ ČASTI Z3 — Easy beh sa
  // tam smie legitímne dostať. Preto „čas v Z3“ sám o sebe nie je chyba; pritvrdým
  // ho robí až výrazný čas NAD laktátovým prahom (Z4–Z5). Hodnotíme cez priemerný
  // tep voči aeróbnemu prahu (stred Z3), nie len cez podiel Z1–Z2.
  if (type === "easy" || type === "long" || type === "rest") {
    const aboveLt = pct(4) + pct(5);        // nad laktátovým prahom = pre Easy naozaj tvrdé
    const z3low = lowOf(3);                  // spodok Z3 = zhruba aeróbny prah Garminu
    const z4low = lowOf(4);                  // spodok Z4 = laktátový prah
    // Aeróbny prah (strop Easy) ≈ SPODNÁ ČASŤ Z3 (metodika: AeT ≈ 0.86×LTHR), nie stred.
    const aet = z3low != null && z4low != null ? Math.round(z3low + 0.3 * (z4low - z3low)) : null;
    const avg = stats?.avg_hr ?? null;
    const underAet = avg != null && aet != null && avg <= aet;

    // 1) Výrazný čas nad laktátovým prahom → na Easy/regeneračný beh naozaj pritvrdo
    if (aboveLt >= 20)
      return { tone: "warn", note: `Na Easy/regeneračný beh pritvrdo — ${aboveLt}% času nad laktátovým prahom (Z4–Z5). Easy behy maj naozaj ľahké, inak narúšajú regeneráciu (jadrom Hansona je kumulovaná únava, nie každodenná tvrdosť).` };

    // 2) Učebnicový Easy — väčšina v Z1–Z2
    if (easy >= 75)
      return { tone: "good", note: "Pekne ľahko — väčšina času v Z1–Z2. Presne takto má vyzerať Easy/dlhý beh: buduješ aeróbnu bázu a regeneruješ." };

    // 3) Priemer pod aeróbnym prahom (spodok–stred Z3) → ešte v poriadku
    if (underAet)
      return { tone: "good", note: `V poriadku — priemer ${avg} bpm si držal pod aeróbnym prahom (~${aet} bpm), čo je strop Easy behu podľa metodiky. Časť času v Z3 je pri Easy normálna; pokojne aj o niečo nižšie (Z1–Z2) sa zotavíš ešte lepšie.` };

    // 4) Prevažne v hornej časti Z3 (nad aeróbnym prahom, ešte pod LT) → mierne rýchlo
    return { tone: "info", note: `Mierne rýchlejšie — väčšinu času si bol v Z3, ${avg != null ? `priemer ${avg} bpm` : "podiel ľahkých zón nízky"}. Na regeneračný beh skús nabudúce spomaliť pod aeróbny prah${aet != null ? ` (~${aet} bpm)` : ""}, do Z1–Z2.` };
  }

  // Kvalitné tréningy (speed/strength/tempo) + ostatné behy
  const isSos = type === "speed" || type === "strength" || type === "tempo";
  let note = `${isSos ? "Kvalitný tréning" : "Tréning"} — ${hard}% času v Z3–Z5.`;
  if (stats?.aerobic_te) note += ` Aeróbny efekt ${Number(stats.aerobic_te).toFixed(1)}/5 (rozvoj vytrvalosti a kondície).`;
  if (stats?.anaerobic_te && stats.anaerobic_te >= 1)
    note += ` Anaeróbny ${Number(stats.anaerobic_te).toFixed(1)}/5 (rozvoj rýchlosti a výkonu).`;
  return { tone: "good", note };
}
