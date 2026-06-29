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
  total_ascent?: number | null;
  avg_pace_sec_km?: number | null;
  gap_pace_sec_km?: number | null;
  form_drift?: {
    pace_sec_delta?: number | null;
    hr_delta?: number | null;
    vertical_ratio_delta?: number | null;
    stride_length_delta_cm?: number | null;
    cadence_delta?: number | null;
  } | null;
  weather?: {
    temp_c?: number | null;
    feels_like_c?: number | null;
    humidity_pct?: number | null;
    wind_kmh?: number | null;
  } | null;
}

export function runInsight(title: string, stats: RunStats | null | undefined): RunInsight | null {
  const base = baseInsight(title, stats);
  if (!base) return null;

  // Terénový doplnok: pri výraznom prevýšení vysvetli rozdiel reálneho tempa a GAP
  // (tempo prepočítané na rovinu), aby kopec nevyzeral ako strata formy.
  const asc = stats?.total_ascent;
  const gap = stats?.gap_pace_sec_km;
  const pace = stats?.avg_pace_sec_km;
  if (asc != null && asc >= 80) {
    let t = ` Terén: nastúpaných ${Math.round(asc)} m.`;
    if (gap && pace && Math.abs(gap - pace) >= 5) {
      const f = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      t += ` Tempo na rovine (GAP) ${f(gap)}/km vs. reálne ${f(pace)}/km — ${
        gap < pace
          ? "kopce ti spomalili tempo, výkonnostne to bolo lepšie, než vyzerá"
          : "klesanie ti tempo nadľahčilo"
      }.`;
    }
    base.note += t;
  }

  // Rozpad formy: rast tepu + vert. pomeru a skrátenie kroku v 2. polovici = únava.
  const fd = stats?.form_drift;
  if (fd) {
    const hrUp = (fd.hr_delta ?? 0) >= 5;
    const ratioUp = (fd.vertical_ratio_delta ?? 0) >= 0.3;
    const strideDown = (fd.stride_length_delta_cm ?? 0) <= -2;
    if ((hrUp && ratioUp) || (hrUp && strideDown)) {
      base.note += ` Forma sa v 2. polovici rozpadávala (tep ${fd.hr_delta! >= 0 ? "+" : ""}${fd.hr_delta} bpm${
        ratioUp ? `, vert. pomer +${fd.vertical_ratio_delta}%` : ""
      }${strideDown ? `, krok ${fd.stride_length_delta_cm} cm` : ""}) — znak únavy/nedostatočnej durability.`;
      if (base.tone === "good") base.tone = "info";
    } else if (fd.hr_delta != null && fd.hr_delta <= 2 && (fd.stride_length_delta_cm ?? 0) >= -1) {
      base.note += " Formu si držal stabilnú až do konca — dobrá odolnosť (durability).";
    }
  }

  // Počasie: teplo + vlhko zvyšujú tep pri rovnakom tempe (drift z tepla).
  const wx = stats?.weather;
  const feels = wx?.feels_like_c ?? wx?.temp_c;
  if (feels != null && feels >= 22) {
    const humid = (wx?.humidity_pct ?? 0) >= 70;
    base.note += ` Bolo teplo (${feels} °C${humid ? `, vlhko ${wx!.humidity_pct} %` : ""}) — vyšší tep pri rovnakom tempe je čakaný (drift z tepla), neber to ako stratu formy.`;
    if (base.tone === "warn") base.tone = "info";
  }
  return base;
}

function baseInsight(title: string, stats: RunStats | null | undefined): RunInsight | null {
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
