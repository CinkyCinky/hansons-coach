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

// Skratka svetovej strany, odkiaľ vietor fúka (S/SV/…/SZ z Garminu), → prídavné
// meno pre plynulú vetu („severný vietor"). Neznámy smer → null (vetu vynecháme).
const WIND_DIR_ADJ: Record<string, string> = {
  S: "severný", SV: "severovýchodný", V: "východný", JV: "juhovýchodný",
  J: "južný", JZ: "juhozápadný", Z: "západný", SZ: "severozápadný",
};
function windDirAdj(dir?: string | null): string | null {
  if (!dir) return null;
  return WIND_DIR_ADJ[dir.trim().toUpperCase()] ?? null;
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
    wind_dir?: string | null;
  } | null;
  hr_recovery?: number | null;
  decoupling_pct?: number | null;
  avg_cadence?: number | null;
}

export function runInsight(title: string, stats: RunStats | null | undefined): RunInsight | null {
  const base = baseInsight(title, stats);
  if (!base) return null;
  const type = classifyWorkout(title).type;

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

  // Počasie: teplo/vlhko dvíhajú tep pri rovnakom tempe (drift z tepla). Pod ~24 °C
  // je vplyv malý — komentujeme ho len keď je aj vlhko, aby sme pri príjemných
  // 20–23 °C nestrašili driftom. Tiery podľa reálneho vplyvu na tep.
  const wx = stats?.weather;
  const feels = wx?.feels_like_c ?? wx?.temp_c;
  const humidity = wx?.humidity_pct ?? null;
  const humid = (humidity ?? 0) >= 70;
  let weatherNoted = false;
  if (feels != null) {
    if (feels >= 27) {
      base.note += ` Bolo horúco (${feels} °C${humid ? `, vlhko ${humidity} %` : ""}) — výrazne vyšší tep pri rovnakom tempe je čakaný (drift z tepla); ber to ako záťaž navyše, nie stratu formy.`;
      if (base.tone === "warn") base.tone = "info";
      weatherNoted = true;
    } else if (feels >= 24 || (feels >= 21 && humid)) {
      base.note += ` Bolo teplejšie (${feels} °C${humid ? `, vlhko ${humidity} %` : ""}) — mierne vyšší tep pri rovnakom tempe je normálny (drift z tepla).`;
      if (base.tone === "warn") base.tone = "info";
      weatherNoted = true;
    }
    // pod ~24 °C a bez vlhka počasie nekomentujeme — nemá výpovednú hodnotu
  }

  // Vysoká vlhkosť aj bez tepla: pot sa horšie odparuje → telo sa ťažšie chladí →
  // pri rovnakom tempe vyšší tep a namáhavejší beh. Komentujeme len keď sme počasie
  // nespomenuli už cez teplotu (nech sa neopakujeme) a vlhkosť je naozaj vysoká.
  if (!weatherNoted && humidity != null && humidity >= 85) {
    base.note += ` Bolo veľmi vlhko (${humidity} %) — pot sa horšie odparuje a telo sa ťažšie chladí, takže aj bez tepla ide tep vyššie a beh je namáhavejší. Viac sa potíš, tak nezabúdaj dopĺňať tekutiny.`;
    if (base.tone === "warn") base.tone = "info";
  }

  // Vietor: proti vetru je pri rovnakej námahe tempo pomalšie. Poznáme smer, odkiaľ
  // fúkal, ale nie orientáciu celej trasy — na okruhu sa protivietor a zadný vietor
  // čiastočne vyrušia, preto hovoríme len o vplyve, nie o „strate výkonu".
  const wind = wx?.wind_kmh ?? null;
  const windAdj = windDirAdj(wx?.wind_dir);
  if (wind != null && wind >= 25) {
    base.note += ` Fúkal silný${windAdj ? ` ${windAdj}` : ""} vietor (${wind} km/h) — proti vetru je tempo pri rovnakej námahe citeľne pomalšie, neber to ako slabší výkon.`;
  } else if (wind != null && wind >= 15) {
    base.note += ` Fúkal citeľný${windAdj ? ` ${windAdj}` : ""} vietor (${wind} km/h) — na úsekoch proti vetru ťa pri rovnakej námahe trochu pribrzdil.`;
  }

  // Tep zotavenia (HRR): vyššie/rýchlejšie klesnutie tepu po behu = lepšia
  // parasympatická regenerácia a kondícia. Meria sa manuálne, takže len občas.
  const hrr = stats?.hr_recovery;
  if (hrr != null && hrr > 0) {
    if (hrr >= 30) base.note += ` Tep zotavenia −${hrr} bpm za ~2 min — výborná regenerácia (silný parasympatikus).`;
    else if (hrr >= 15) base.note += ` Tep zotavenia −${hrr} bpm za ~2 min — v poriadku.`;
    else base.note += ` Tep zotavenia len −${hrr} bpm za ~2 min — nižší (únava, teplo alebo tvrdý záver); sleduj trend pri podobných behoch.`;
  }

  // Durabilita (aeróbny decoupling) pri rovnomerných behoch — objektívny signál
  // aeróbnej vytrvalosti; dopĺňa rozpad formy vyššie.
  const dc = stats?.decoupling_pct;
  if (dc != null && (type === "easy" || type === "long" || type === "tempo")) {
    if (dc < 5) base.note += ` Tep držal krok s tempom celý beh (drift ${dc} %) — výborná aeróbna vytrvalosť.`;
    else if (dc > 8) base.note += ` V 2. polovici tep driftoval hore voči tempu (drift ${dc} %) — únava, teplo alebo slabšia aeróbna báza.`;
  }

  // Kadencia: nízka frekvencia krokov = väčší náraz na kolená; jemný tip.
  const cad = stats?.avg_cadence;
  if (cad != null && cad > 0 && cad < 163) {
    base.note += ` Kadencia ${cad} spm je nižšia — skús ju postupne dvíhať k ~170–180 (kratší, svižnejší krok šetrí kolená).`;
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
