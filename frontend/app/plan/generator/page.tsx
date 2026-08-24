"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, Send, Calendar as CalIcon, Bot, CheckCircle2, MessageCircle, Repeat, Info, AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { generatePlan, uploadPlan, fetchProfile } from "@/lib/api";
import { useStore } from "@/lib/store";
import { classifyWorkout } from "@/lib/workoutType";

const STEP_INPUT = "bg-[#1a1a24] border border-white/10 rounded px-1.5 py-1 text-white text-center focus:outline-none focus:border-primary/50";

// Slovenské názvy typov krokov (zrkadlí STEP_COLORS v app/plan/page.tsx)
const STEP_LABELS: Record<string, string> = {
  warmup: "Rozcvička", interval: "Interval", run: "Beh", recover: "Zotavenie",
  recovery: "Zotavenie", cooldown: "Vychladenie", repeat: "Opakovanie",
};

// Dni týždňa v poradí Po→Ne (index 0..6). Generuje sa len zvyšok týždňa,
// preto dni, ktoré už tento týždeň prešli, nie sú voliteľné.
const DAY_KEYS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"] as const;
// Dnešný deň ako index Po=0..Ne=6 (JS getDay: Ne=0..So=6 → posun o +6 mod 7).
const todayWeekIdx = () => (new Date().getDay() + 6) % 7;

// Garmin vie tempo prečítať len v tvare m:ss — na mobile sa však bežne zadá "5.20" alebo
// "5,20", preto bodku aj čiarku berieme ako oddeľovač a hodnotu prepíšeme na m:ss.
// Vráti null, ak sa hodnota rozparsovať nedá (→ pole zvýrazníme a zápis zablokujeme).
function normalizePace(raw: any): string | null {
  const t = String(raw ?? "").trim().replace(/\s+/g, "");
  if (!t) return null;
  const m = t.match(/^(\d{1,2})([:.,])(\d{1,2})$/);
  if (m) {
    // Pri bodke/čiarke vyžadujeme dve číslice sekúnd — "5.2" je nejednoznačné (5:02 vs 5:12).
    if (m[2] !== ":" && m[3].length !== 2) return null;
    const sec = parseInt(m[3], 10);
    if (sec > 59) return null;
    return `${parseInt(m[1], 10)}:${String(sec).padStart(2, "0")}`;
  }
  if (/^\d{1,2}$/.test(t)) return `${parseInt(t, 10)}:00`;   // samotné "5" znamená 5:00
  return null;
}

// Prázdne tempo je v poriadku (krok potom ide bez cieľa), nerozparsovateľné nie.
const isPaceBad = (raw: any) => String(raw ?? "").trim() !== "" && normalizePace(raw) === null;

// Krok bez kladnej vzdialenosti by Garmin dostal ako 0 m — zápis by "prešiel", ale krok by bol prázdny.
const isDistanceBad = (raw: any) => {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace(",", "."));
  return !Number.isFinite(n) || n <= 0;
};

// Chyby jedného kroku — používajú sa naraz na červené zvýraznenie polí aj na zablokovanie zápisu.
function stepErrors(s: any): { distance: boolean; paceMin: boolean; paceMax: boolean } {
  const isHr = s?.hr_min != null || s?.hr_max != null;
  return {
    distance: isDistanceBad(s?.distance_km),
    paceMin: !isHr && isPaceBad(s?.pace_min),
    paceMax: !isHr && isPaceBad(s?.pace_max),
  };
}

// Ploché kroky tréningu vrátane vnorených v repeat-bloku (samotný repeat vzdialenosť nemá).
function flattenSteps(steps: any): any[] {
  return (Array.isArray(steps) ? steps : []).flatMap((s: any) =>
    s?.type === "repeat" ? (Array.isArray(s.steps) ? s.steps : []) : [s]
  );
}

// Neplatné pole zvýrazníme červeným rámikom — farbu vymeníme v základnej triede,
// aby si dve border-* triedy navzájom neprekážali.
const stepInputCls = (bad: boolean) => (bad ? STEP_INPUT.replace("border-white/10", "border-rose-500") : STEP_INPUT);

// Slovný popis kroku do súhrnu repeat-bloku — chýbajúce polia pomenuje slovami,
// aby sa nikde nezobrazilo "undefinedkm @ undefined-undefined".
function describeStep(s: any): string {
  const label = STEP_LABELS[s?.type] ?? "Krok";
  const dist = isDistanceBad(s?.distance_km) ? "vzdialenosť nezadaná" : `${s.distance_km} km`;
  let target = "bez tempového cieľa";
  if (s?.hr_min != null || s?.hr_max != null) {
    target = `${s.hr_min ?? "?"}–${s.hr_max ?? "?"} bpm`;
  } else if (s?.pace_min || s?.pace_max) {
    const lo = normalizePace(s?.pace_min);
    const hi = normalizePace(s?.pace_max);
    // Ak sa nedá prečítať ani jedno tempo, jednotku min/km už nepripájame — inak by
    // vzniklo neobratné „neplatné tempo min/km“.
    if (lo && hi) target = `${lo}–${hi} min/km`;
    else if (lo || hi) target = `${lo ?? hi} min/km`;
    else target = "neplatné tempo";
  }
  return `${label} ${dist} · ${target}`;
}

// Slovenské množné číslo (1 tréning / 2–4 tréningy / 5+ tréningov).
const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

// Počet opakovaní z AI dát — chýbajúci/nezmyselný nahradíme slovom, nie "undefined".
const repeatIterations = (raw: any): number | null => {
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Chyby opakovacieho bloku. Neplatný počet opakovaní backend spracuje ako int("abc") a deň
// spadne; blok bez vnorených úsekov by Garmin dostal ako jeden interval s 0 m.
function repeatErrors(s: any): { iterations: boolean; empty: boolean } {
  return {
    iterations: repeatIterations(s?.iterations) === null,
    empty: !(Array.isArray(s?.steps) && s.steps.length > 0),
  };
}

// Posledná poistka tesne pred odoslaním: tempá, ktorých sa zverenec nedotkol (napr. "5.20"
// rovno od AI), prepíšeme na tvar m:ss a počet opakovaní na celé číslo — Garmin iný tvar
// neprečíta a krok by v hodinkách skončil bez cieľa, hoci by appka hlásila úspech.
// `bad` = počet hodnôt, ktoré sa prepísať nedali; vtedy zápis nepustíme ďalej.
function normalizeWorkoutsForUpload(workouts: any[]): { workouts: any[]; bad: number } {
  let bad = 0;
  const fixStep = (s: any): any => {
    const next = { ...s };
    if (isDistanceBad(next?.distance_km)) bad++;
    const isHr = next?.hr_min != null || next?.hr_max != null;
    if (!isHr) {
      (["pace_min", "pace_max"] as const).forEach((field) => {
        if (String(next[field] ?? "").trim() === "") return;   // prázdne tempo je v poriadku
        const fixed = normalizePace(next[field]);
        if (fixed) next[field] = fixed;
        else bad++;
      });
    }
    return next;
  };
  const out = (Array.isArray(workouts) ? workouts : []).map((w: any) => {
    if (!Array.isArray(w?.steps)) return w;   // tréning bez krokov (napr. voľno) necháme tak
    return {
      ...w,
      steps: w.steps.map((s: any) => {
        if (s?.type !== "repeat") return fixStep(s);
        const err = repeatErrors(s);
        if (err.iterations || err.empty) bad++;
        return {
          ...s,
          iterations: repeatIterations(s?.iterations) ?? s?.iterations,
          steps: (Array.isArray(s.steps) ? s.steps : []).map(fixStep),
        };
      }),
    };
  });
  return { workouts: out, bad };
}

// Jeden editovateľný krok tréningu (vzdialenosť + tempo alebo HR). Použité aj vnútri repeat-blokov.
function StepRow({ s, onField }: { s: any; onField: (field: string, value: any) => void }) {
  const isHr = s.hr_min != null || s.hr_max != null;
  const err = stepErrors(s);
  // Pri opustení poľa hodnotu rovno prepíšeme na m:ss, nech užívateľ vidí, čo pôjde do hodiniek.
  const normalizeOnBlur = (field: string, raw: any) => {
    const fixed = normalizePace(raw);
    if (fixed && fixed !== String(raw ?? "").trim()) onField(field, fixed);
  };
  const messages = [
    err.distance ? "Zadaj vzdialenosť väčšiu ako 0 km." : null,
    err.paceMin || err.paceMax ? "Tempo zadaj ako minúty:sekundy, napr. 5:20 (bodka aj čiarka platia tiež: 5.20)." : null,
  ].filter(Boolean) as string[];
  return (
    <div className="flex flex-col gap-1 bg-white/5 p-2 rounded-lg">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-gray-300 w-20 shrink-0">{STEP_LABELS[s.type] ?? s.type}</span>
        <span className="flex items-center gap-1">
          <input
            type="number" step="0.1" inputMode="decimal" value={s.distance_km ?? ""}
            onChange={(e) => onField("distance_km", e.target.value === "" ? null : parseFloat(e.target.value))}
            className={`w-16 ${stepInputCls(err.distance)}`}
          />
          <span className="text-gray-500">km</span>
        </span>
        {isHr ? (
          <span className="flex items-center gap-1 text-rose-300 ml-auto">
            <input type="number" inputMode="numeric" value={s.hr_min ?? ""}
              onChange={(e) => onField("hr_min", e.target.value === "" ? null : parseInt(e.target.value))} className={`w-14 ${STEP_INPUT}`} />
            <span>–</span>
            <input type="number" inputMode="numeric" value={s.hr_max ?? ""}
              onChange={(e) => onField("hr_max", e.target.value === "" ? null : parseInt(e.target.value))} className={`w-14 ${STEP_INPUT}`} />
            <span className="text-gray-500">bpm</span>
          </span>
        ) : (
          <span className="flex items-center gap-1 text-emerald-300 ml-auto">
            <input value={s.pace_min ?? ""} placeholder="5:20"
              onChange={(e) => onField("pace_min", e.target.value)}
              onBlur={(e) => normalizeOnBlur("pace_min", e.target.value)}
              className={`w-14 ${stepInputCls(err.paceMin)}`} />
            <span>–</span>
            <input value={s.pace_max ?? ""} placeholder="5:10"
              onChange={(e) => onField("pace_max", e.target.value)}
              onBlur={(e) => normalizeOnBlur("pace_max", e.target.value)}
              className={`w-14 ${stepInputCls(err.paceMax)}`} />
            <span className="text-gray-500" title="tempo v min:sek na kilometer (pomalší–rýchlejší okraj)">min/km</span>
          </span>
        )}
      </div>
      {messages.length > 0 && (
        <p className="text-[11px] text-rose-400 leading-snug">{messages.join(" ")}</p>
      )}
    </div>
  );
}

export default function Generator() {
  const store = useStore();
  const router = useRouter();
  const [days, setDays] = useState({
    Po: true, Ut: true, St: true, Št: true, Pi: true, So: true, Ne: true
  });
  const [message, setMessage] = useState("");
  const [aiContext, setAiContext] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  // JEDEN stav výsledku zápisu (zapísané + nezapísané dni) — inak by naraz svietil úspech aj chyba.
  const [uploadResult, setUploadResult] = useState<{ uploaded: any[]; failed: any[] } | null>(null);

  // Načítaj ai_context z profilu pre kontext pri generácii
  useEffect(() => {
    fetchProfile()
      .then((p) => {
        if (p.ai_context) setAiContext(p.ai_context);
      })
      .catch(() => {});
  }, []);

  // Dni, ktoré už tento týždeň prešli (Po=0..Ne=6), nemôžeš vybrať — odznač ich pri načítaní.
  const todayIdx = todayWeekIdx();
  const isPastDay = (day: string) => DAY_KEYS.indexOf(day as (typeof DAY_KEYS)[number]) < todayIdx;
  useEffect(() => {
    setDays((prev) => {
      const next = { ...prev };
      DAY_KEYS.forEach((k, i) => { if (i < todayIdx) next[k] = false; });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCount = Object.values(days).filter(Boolean).length;

  const handleGenerate = async () => {
    if (loading || selectedCount === 0) return;
    setLoading(true);
    setError(null);
    setUploadResult(null);
    try {
      const availableDays = Object.entries(days).filter(([_, v]) => v).map(([k]) => k).join(", ");
      // Dni tohto týždňa, ktoré už prešli — AI ich má brať ako zmeškané a neplánovať.
      const passedDays = DAY_KEYS.filter((_, i) => i < todayIdx).join(", ");
      const passedPart = passedDays
        ? ` Dni tohto týždňa, ktoré už PREŠLI (zmeškané — NEplánuj ich a ak na ne padol kľúčový tréning, ber ho ako neabsolvovaný): ${passedDays}.`
        : "";
      // Zloučenie užívateľských inštrukcií s AI kontext (ai_context z profilu)
      const contextPart = aiContext ? `\n\nDOPLNKOVÉ INFORMÁCIE O ZVERENCOVI (z profilu): ${aiContext}` : "";
      const constraints = `Dostupné dni na beh (zvyšok tohto týždňa): ${availableDays}.${passedPart} Ďalšie požiadavky od zverenca: ${message || "Žiadne"}.${contextPart}`;
      
      const plan = await generatePlan(constraints);
      setGeneratedPlan(plan);
    } catch (err: any) {
      setError(err.message || "Nepodarilo sa vygenerovať plán.");
    } finally {
      setLoading(false);
    }
  };

  // Backend hlási neúspešné dni dátumom — rovnaký prepočet (date, inak day_offset od dneška)
  // nám umožní poslať na opakovaný zápis len tréningy, ktoré naozaj zlyhali.
  const resolveWorkoutDate = (w: any): string => {
    if (w?.date) return String(w.date).slice(0, 10);
    const d = new Date();
    d.setDate(d.getDate() + (parseInt(String(w?.day_offset ?? 0), 10) || 0));
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // Dátum zo servera pre nováčika: "so 23. 8." namiesto "2026-08-23".
  const formatDateSk = (iso: any) => {
    const d = new Date(String(iso ?? ""));
    return isNaN(d.getTime())
      ? String(iso ?? "neznámy deň")
      : d.toLocaleDateString("sk-SK", { weekday: "short", day: "numeric", month: "numeric" });
  };

  const failedLabel = (f: any) => [f?.date ? formatDateSk(f.date) : null, f?.name].filter(Boolean).join(" – ") || "neznámy tréning";

  // Zápis sa PRERUŠIŤ nedá: uploadPlan neprijíma AbortSignal a server aj tak už mohol tréningy
  // v Garmine prepísať — preto počas zápisu blokujeme „Zrušiť“ namiesto falošného zrušenia.
  // Zapíše zadanú množinu tréningov; už zapísané dni z predošlého pokusu nesie `carryUploaded`,
  // aby výsledok po opakovaní ukázal celkový stav a nie len druhý pokus.
  const runUpload = async (workouts: any[], carryUploaded: any[] = []) => {
    if (uploading) return;
    const list = Array.isArray(workouts) ? workouts : [];
    // Prázdny plán predtým skončil tichým ničím — kliknutie nespravilo nič a nedalo ani odozvu.
    if (list.length === 0) {
      setUploadResult(null);
      setError("Plán neobsahuje ani jeden tréning, takže do Garminu niet čo zapísať. Vygeneruj plán znova.");
      return;
    }
    // Normalizácia beží až tu, nad VŠETKÝMI krokmi — nielen nad tými, ktorých sa zverenec dotkol.
    // Čo sa prepísať nedá, zastaví zápis rovnako ako ručne zadaná neplatná hodnota.
    const { workouts: normalized, bad } = normalizeWorkoutsForUpload(list);
    if (bad > 0) {
      const subject = plural(bad, "1 hodnota nemá", `${bad} hodnoty nemajú`, `${bad} hodnôt nemá`);
      setUploadResult(null);
      setError(
        `Zápis sa nespustil — v pláne ${subject} tvar, ktorý hodinky prečítajú. Tempo musí byť ` +
        "v tvare minúty:sekundy (napr. 5:20), vzdialenosť väčšia ako 0 km a opakovací blok " +
        "potrebuje počet opakovaní aj rozpísané úseky. Oprav červené polia a skús to znova."
      );
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const res = await uploadPlan({ ...generatedPlan, workouts: normalized });
      // Zneplatni cache, aby sa nové tréningy hneď zobrazili v Pláne a na Prehľade
      store.invalidateAll();
      const uploaded: any[] = [...carryUploaded, ...(res?.uploaded ?? [])];
      let failed: any[] = res?.failed ?? [];
      // Ak server odmietol zápis bez zoznamu (napr. prázdny plán), ber celý pokus ako neúspešný,
      // nech má užívateľ čo opakovať a nezostane len holá červená hláška.
      if (res?.status === "error" && failed.length === 0) {
        failed = list.map((w: any) => ({
          date: resolveWorkoutDate(w), name: w?.workout_name,
          reason: res?.message || "Server zápis odmietol.",
        }));
      }
      setUploadResult({ uploaded, failed });
    } catch (err: any) {
      setError(err.message || "Chyba pri nahrávaní do Garminu.");
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = () => runUpload(generatedPlan?.workouts ?? []);

  // Opakovanie len pre neúspešné dni — porovnávame dátumom, pri chýbajúcom dátume názvom tréningu.
  const handleRetryFailed = () => {
    const all: any[] = generatedPlan?.workouts ?? [];
    const failed = uploadResult?.failed ?? [];
    const dates = new Set(failed.map((f) => String(f?.date ?? "").slice(0, 10)).filter(Boolean));
    const names = new Set(failed.map((f) => f?.name).filter(Boolean));
    const retry = all.filter((w: any) => dates.has(resolveWorkoutDate(w)) || names.has(w?.workout_name));
    runUpload(retry.length ? retry : all, uploadResult?.uploaded ?? []);
  };

  // Handoff do chatu: prenesie plán + správu trénera do tabu Tréner, kde môžeš pokračovať
  const handleAskCoach = () => {
    if (!generatedPlan) return;
    const planSummary = (generatedPlan.workouts || [])
      .map((w: any) => `• ${w.day_label ? w.day_label + ": " : ""}${w.workout_name}`)
      .join("\n");
    const userText =
      `Vygeneroval si mi tento plán na tento týždeň:\n\n${planSummary}\n\n` +
      `Mám k nemu otázku — prípadne ho uprav podľa môjho aktuálneho stavu.`;
    store.setChatSeed({ userText, coachMessage: generatedPlan.coach_message || "" });
    router.push("/chat");
  };

  // Úprava vygenerovaného plánu pred zápisom do Garminu.
  // ni (nepovinné) = index vnoreného kroku v repeat-bloku.
  const updateStep = (wi: number, si: number, field: string, value: any, ni?: number) => {
    setGeneratedPlan((prev: any) => {
      const next = structuredClone(prev);
      if (ni == null) next.workouts[wi].steps[si][field] = value;
      else next.workouts[wi].steps[si].steps[ni][field] = value;
      return next;
    });
  };

  const updateRepeatIterations = (wi: number, si: number, value: any) => {
    setGeneratedPlan((prev: any) => {
      const next = structuredClone(prev);
      next.workouts[wi].steps[si].iterations = value;
      return next;
    });
  };

  const updateWorkout = (wi: number, field: string, value: any) => {
    setGeneratedPlan((prev: any) => {
      const next = structuredClone(prev);
      next.workouts[wi][field] = value;
      return next;
    });
  };

  const toggleDay = (d: keyof typeof days) => {
    setDays(prev => ({ ...prev, [d]: !prev[d] }));
  };

  // Kroky s neplatným tempom alebo nulovou vzdialenosťou blokujú zápis — inak by tréning
  // tíško skončil v hodinkách bez cieľa a appka by aj tak hlásila úspech.
  const invalidSteps = ((generatedPlan?.workouts ?? []) as any[]).reduce(
    (acc: number, w: any) =>
      acc + flattenSteps(w?.steps).filter((s: any) => {
        const e = stepErrors(s);
        return e.distance || e.paceMin || e.paceMax;
      }).length,
    0
  );
  // Chybné opakovacie bloky flattenSteps nezachytí (vracia z nich len vnorené kroky), preto
  // ich rátame zvlášť — inak by tlačidlo ostalo aktívne a deň by na serveri zlyhal.
  const invalidRepeats = ((generatedPlan?.workouts ?? []) as any[]).reduce(
    (acc: number, w: any) =>
      acc + (Array.isArray(w?.steps) ? w.steps : []).filter((s: any) => {
        if (s?.type !== "repeat") return false;
        const e = repeatErrors(s);
        return e.iterations || e.empty;
      }).length,
    0
  );
  const failedCount = uploadResult?.failed?.length ?? 0;
  const allUploaded = !!uploadResult && failedCount === 0;

  return (
    <div className="flex flex-col gap-6 pt-4 pb-32">
      <header className="flex items-center gap-3">
        <Link href="/plan">
          <ArrowLeft className="text-gray-400 hover:text-white" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Generátor tréningov</h1>
          {/* Nováčik musí hneď vidieť, čo dostane — nie celý 18-týždňový plán, len zvyšok týždňa. */}
          <p className="text-xs text-gray-400">Tréningy na zvyšok tohto týždňa podľa Hansonovej metódy</p>
        </div>
      </header>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm font-bold break-words">
          Chyba: {error}
        </div>
      )}

      {/* Výsledok zápisu je JEDEN stav — buď hotovo, alebo koľko dní chýba a prečo. */}
      {uploadResult && (
        allUploaded ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-sm font-bold flex items-center gap-2">
            <CheckCircle2 className="shrink-0" /> Hotovo — do tvojho Garmin kalendára sa zapísalo{" "}
            {uploadResult.uploaded.length}{" "}
            {plural(uploadResult.uploaded.length, "tréning", "tréningy", "tréningov")}.
          </div>
        ) : (
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-4 rounded-xl text-sm">
            <p className="font-bold flex items-center gap-2">
              <AlertTriangle size={18} className="shrink-0" />
              Zapísalo sa {uploadResult.uploaded.length} z {uploadResult.uploaded.length + failedCount} tréningov.
            </p>
            <p className="mt-2 text-xs text-amber-200/90 leading-relaxed">
              Nezapísalo sa: <b>{uploadResult.failed.map(failedLabel).join(", ")}</b>.
              {uploadResult.failed[0]?.reason ? ` Dôvod: ${uploadResult.failed[0].reason}` : ""}
            </p>
            <p className="mt-2 text-xs text-amber-200/70 leading-relaxed">
              {/* Pozor na slovo „prešli“ — na tejto stránke znamená kalendárne minulé dni. */}
              Tlačidlom nižšie skúsiš zapísať už len tieto dni — tie, ktoré sa už zapísali, sa neduplikujú.
            </p>
          </div>
        )
      )}

      {!generatedPlan && !loading && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
          {/* Vysvetlenie pre úplného nováčika — bez neho slová Speed/Strength/Tempo/SOS nič nehovoria. */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-xs text-gray-400 leading-relaxed flex flex-col gap-2">
            <p className="flex items-center gap-1.5 font-bold text-gray-300">
              <Info size={14} className="text-primary" /> Ako to funguje
            </p>
            <p>
              Vygeneruje sa ti <b className="text-gray-300">len zvyšok tohto týždňa</b> — konkrétne tréningy na dni, ktoré
              vyberieš nižšie. Nie je to celý 18-týždňový plán; ten beží na pozadí a generátor z neho berie to, čo máš
              tento týždeň odbehať.
            </p>
            <p>
              <b className="text-gray-300">Kľúčové tréningy</b> (v Hansonovej metóde nazývané SOS – „something of
              substance“, teda behy s podstatou) sú tie náročné:{" "}
              <b className="text-rose-300">Speed</b> — krátke rýchle intervaly na tvojom aktuálnom 5 km tempe;{" "}
              <b className="text-orange-300">Strength</b> — dlhé intervaly o kúsok <b className="text-gray-300">rýchlejšie</b>,
              než je tvoje cieľové pretekové tempo (o 6 sekúnd na kilometer);{" "}
              <b className="text-amber-300">Tempo</b> — súvislý beh presne na cieľovom pretekovom tempe (HMP, teda
              tempo, akým chceš bežať preteky); a <b className="text-purple-300">dlhý beh</b> v pokojnom tempe.
            </p>
            <p>
              Medzi dvoma kľúčovými tréningmi musí byť vždy <b className="text-emerald-300">ľahký (Easy) deň</b>. Únava
              sa má prenášať z tréningu do tréningu — to je jadro metódy — ale nie natoľko, aby si ten ďalší kľúčový
              tréning nezvládol v predpísanom tempe. Preto ti tréner nikdy nedá dva tvrdé dni za sebou.
            </p>
          </div>

          <div className="glass-card p-5">
            <h3 className="font-bold mb-3 flex items-center gap-2"><CalIcon size={18} className="text-primary"/> 1. Dostupné dni na beh</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(days).map(([day, isSelected]) => {
                const past = isPastDay(day);
                return (
                  <button
                    key={day}
                    onClick={() => { if (!past) toggleDay(day as keyof typeof days); }}
                    disabled={past}
                    title={past ? "Tento deň už tento týždeň prešiel" : undefined}
                    className={`w-12 h-12 rounded-xl font-bold transition-colors ${
                      past
                        ? "bg-white/5 text-gray-700 line-through opacity-40 cursor-not-allowed"
                        : isSelected
                        ? "bg-primary text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                        : "bg-white/5 text-gray-500 border border-white/10"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-3">Vyber dni, kedy môžeš behať <b className="text-gray-300">tento týždeň</b> — dni, ktoré už prešli, sa vybrať nedajú. AI tréner z nich poskladá zvyšok týždňa podľa Hansonovej metódy (kľúčové tréningy rozloží správne, nikdy nie 2 tvrdé dni za sebou). Návrh uvidíš pred zápisom do Garminu.</p>
          </div>

          <div className="glass-card p-5">
            <h3 className="font-bold mb-3 flex items-center gap-2"><Bot size={18} className="text-primary"/> 2. Inštrukcie pre trénera</h3>
            <textarea 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Napr. V utorok hrám tenis 2 hodiny, v piatok ma bolí koleno, takže chcem len výklus."
              className="w-full bg-[#1a1a24] border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors resize-none h-32"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={selectedCount === 0}
            className="bg-primary hover:bg-blue-600 text-white font-bold py-4 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            <Send size={18} /> Vygenerovať plán
          </button>
          {selectedCount === 0 && (
            <p className="text-xs text-amber-400 text-center -mt-3">Vyber aspoň jeden deň, kedy si dostupný.</p>
          )}
        </motion.div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-primary" size={48} />
          <p className="text-gray-400 mt-4 font-bold text-center">Tréner študuje tvoje dáta<br/>a navrhuje tréningy...</p>
        </div>
      )}

      {generatedPlan && !loading && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl">
            <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-2">Tréner radí</h3>
            <p className="text-sm text-gray-200">{generatedPlan.coach_message}</p>
            <button
              onClick={handleAskCoach}
              className="mt-3 inline-flex items-center gap-2 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 text-xs font-bold px-3 py-2 rounded-xl transition-colors"
            >
              <MessageCircle size={15} /> Spýtať sa trénera na tento plán
            </button>
          </div>

          {/* "i" panel: z čoho sú tempá počítané (transparentnosť/dôvera) */}
          {generatedPlan.paces && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-xs">
              <p className="flex items-center gap-1.5 font-bold text-gray-300 mb-2">
                <Info size={14} className="text-primary" /> Z čoho sú tempá počítané
              </p>
              {(() => {
                const isJF = generatedPlan.paces.variant === "Just Finish";
                return (
                  <>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300">
                      <span>Easy / Dlhé</span><span className="text-right font-mono text-emerald-300">{generatedPlan.paces.easy_min}–{generatedPlan.paces.easy_max}/km</span>
                      {isJF ? (
                        <><span>Tempo dobehnutia (ref.)</span><span className="text-right font-mono text-gray-400">~{generatedPlan.paces.tempo}/km</span></>
                      ) : (
                        <>
                          <span>Tempo — cieľové pretekové tempo (HMP)</span><span className="text-right font-mono text-amber-300">{generatedPlan.paces.tempo}/km</span>
                          <span>Strength</span><span className="text-right font-mono text-orange-300">{generatedPlan.paces.strength}/km</span>
                          <span>Speed</span><span className="text-right font-mono text-rose-300">{generatedPlan.paces.speed}/km</span>
                        </>
                      )}
                    </div>
                    {/* Nováčik potrebuje vedieť, čo si pod anglickým názvom typu behu predstaviť. */}
                    {!isJF && (
                      <ul className="text-[11px] text-gray-500 mt-2 space-y-0.5 leading-relaxed">
                        <li><b className="text-rose-300">Speed</b> — krátke rýchle intervaly na tvojom aktuálnom 5 km tempe.</li>
                        <li><b className="text-orange-300">Strength</b> — dlhé intervaly o kúsok rýchlejšie než cieľové pretekové tempo (HMP − 6 s/km).</li>
                        <li><b className="text-amber-300">Tempo</b> — súvislý beh presne na cieľovom pretekovom tempe (HMP).</li>
                        <li><b className="text-emerald-300">Easy</b> — pokojný beh výrazne pomalší než preteky (HMP + 40 až 75 s/km).</li>
                      </ul>
                    )}
                    <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                      Variant <b className="text-gray-300">{generatedPlan.paces.variant}</b> · týždeň {generatedPlan.paces.training_week}/18.
                      {isJF
                        ? <> Just Finish sa beží celý v Easy tempe (kotvené cieľom <b className="text-gray-300">{generatedPlan.paces.target_time}</b>) — intervaly ani tempo nie sú.</>
                        : <> Tempo/Strength/Easy z cieľa <b className="text-gray-300">{generatedPlan.paces.target_time}</b>; Speed z {generatedPlan.paces.vo2max ? <>VO2max <b className="text-gray-300">{generatedPlan.paces.vo2max}</b></> : "cieľa (VO2max nedostupné)"}.</>}
                      {" "}Tep je len referencia — behy riadime tempom.
                    </p>
                  </>
                );
              })()}
            </div>
          )}

          <div>
            <h3 className="font-bold mb-1 text-lg">
              Návrh plánu ({generatedPlan.workouts?.length ?? 0}{" "}
              {plural(generatedPlan.workouts?.length ?? 0, "tréning", "tréningy", "tréningov")} • tento týždeň)
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Pred zápisom do Garminu môžeš upraviť názvy, vzdialenosti, tempá aj tepy.
            </p>
            <div className="flex flex-col gap-3">
              {/* Aj zoznam tréningov môže chýbať — radšej prázdny zoznam než pád obrazovky. */}
              {(Array.isArray(generatedPlan.workouts) ? generatedPlan.workouts : []).map((w: any, idx: number) => (
                <div key={idx} className="glass-card p-4 rounded-xl border border-white/5">
                  {(() => {
                    const c = classifyWorkout(w.workout_name);
                    return (
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        {w.day_label && (
                          <p className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-1.5">
                            <CalIcon size={13} /> {w.day_label}
                          </p>
                        )}
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${c.badge}`}>
                          {c.label}
                        </span>
                      </div>
                    );
                  })()}
                  <input
                    value={w.workout_name ?? ""}
                    onChange={(e) => updateWorkout(idx, "workout_name", e.target.value)}
                    className="font-bold text-primary w-full bg-transparent border-b border-white/10 focus:outline-none focus:border-primary/50 pb-1"
                  />
                  {w.description && <p className="text-xs text-gray-400 mb-1 mt-1">{w.description}</p>}
                  {classifyWorkout(w.workout_name).why && (
                    <p className="text-[11px] text-gray-500 italic mb-2 leading-snug">
                      💡 {classifyWorkout(w.workout_name).why}
                    </p>
                  )}
                  <div className="flex flex-col gap-2 mt-2">
                    {/* Tréning môže prísť aj bez poľa steps (napr. „Voľno – regenerácia“) — .map() na undefined by zhodil celú obrazovku. */}
                    {!Array.isArray(w.steps) || w.steps.length === 0 ? (
                      <p className="text-[11px] text-gray-500 italic leading-snug">
                        Tento tréning nemá rozpísané kroky (napr. voľno alebo regenerácia) — do Garminu sa zapíše len jeho názov.
                      </p>
                    ) : (
                      w.steps.map((s: any, s_idx: number) =>
                        s.type === "repeat" ? (
                          Array.isArray(s.steps) && s.steps.length > 0 ? (
                            <div key={s_idx} className="bg-white/5 rounded-lg p-2 border border-accent/20">
                              <div className="flex items-center gap-2 text-xs font-bold text-accent mb-2">
                                <Repeat size={13} />
                                {/* Prázdne pole namiesto falošnej „1“ — inak by neplatný počet opakovaní
                                    od AI vyzeral v poriadku a deň by na serveri zlyhal. */}
                                <input
                                  type="number" inputMode="numeric" min={1} value={repeatIterations(s.iterations) ?? ""}
                                  onChange={(e) => updateRepeatIterations(idx, s_idx, e.target.value === "" ? null : parseInt(e.target.value))}
                                  className={`w-12 ${stepInputCls(repeatErrors(s).iterations)}`}
                                />
                                <span>× opakovať</span>
                              </div>
                              {repeatErrors(s).iterations && (
                                <p className="text-[11px] text-rose-400 mb-2 leading-snug">
                                  Zadaj počet opakovaní — celé číslo väčšie ako 0.
                                </p>
                              )}
                              {/* Súhrn bloku slovami — nech je jasné, čo sa vlastne opakuje. */}
                              <p className="text-[11px] text-gray-500 mb-2 leading-snug">
                                {repeatIterations(s.iterations) ?? "?"}× ({s.steps.map(describeStep).join(" + ")})
                              </p>
                              <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent/20">
                                {s.steps.map((ns: any, n_idx: number) => (
                                  <StepRow key={n_idx} s={ns} onField={(f, v) => updateStep(idx, s_idx, f, v, n_idx)} />
                                ))}
                              </div>
                            </div>
                          ) : (
                            // Opakovací blok bez vnorených krokov — bez ošetrenia by sa vykreslil ako prázdny krok.
                            <div key={s_idx} className="bg-white/5 rounded-lg p-2 border border-accent/20">
                              <p className="flex items-center gap-2 text-xs font-bold text-accent mb-1">
                                <Repeat size={13} /> Opakovací blok
                              </p>
                              <p className="text-[11px] text-amber-300/90 leading-snug">
                                {repeatIterations(s.iterations)
                                  ? `${repeatIterations(s.iterations)}× opakovanie, ale bez rozpísaných úsekov`
                                  : "Blok nemá uvedený počet opakovaní ani úseky"} — do hodiniek by sa nezapísalo nič
                                konkrétne, preto je zápis zablokovaný. Uprav ho cez „Spýtať sa trénera na tento plán“
                                alebo plán vygeneruj znova.
                              </p>
                            </div>
                          )
                        ) : (
                          <StepRow key={s_idx} s={s} onField={(f, v) => updateStep(idx, s_idx, f, v)} />
                        )
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Zápis je deštruktívny, ale bezpečný v poradí: backend starý tréning zmaže až po tom,
              čo sa náhrada úspešne zapíše — pri páde Garminu tak neostaneš bez plánu. */}
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-300 p-3 rounded-xl text-xs leading-relaxed">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              <b>Zápis prepíše, čo už máš v Garmine.</b> Tréningy, ktoré máš naplánované na rovnaké dni, sa nahradia
              týmito. Ostatné dni zostanú nedotknuté.
            </span>
          </div>

          {invalidSteps > 0 && (
            <p className="text-xs text-rose-400 -mt-3">
              {invalidSteps} {plural(invalidSteps, "krok má", "kroky majú", "krokov má")} neplatnú vzdialenosť alebo
              tempo (červené polia) — oprav ich, inak by sa do hodiniek zapísali bez cieľa a appka by ti aj tak
              hlásila úspech.
            </p>
          )}

          {invalidRepeats > 0 && (
            <p className="text-xs text-rose-400 -mt-3">
              {invalidRepeats} {plural(invalidRepeats, "opakovací blok má", "opakovacie bloky majú", "opakovacích blokov má")}{" "}
              neplatný počet opakovaní alebo žiadne rozpísané úseky — oprav ich, inak by taký blok skončil
              v hodinkách ako prázdny úsek alebo by sa deň nezapísal vôbec.
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setGeneratedPlan(null)}
              disabled={uploading}
              title={uploading ? "Zápis do Garminu už beží a nedá sa vrátiť späť" : undefined}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploading ? "Nedá sa zrušiť" : "Zrušiť"}
            </button>
            <button
              onClick={failedCount > 0 ? handleRetryFailed : handleUpload}
              disabled={uploading || allUploaded || invalidSteps > 0 || invalidRepeats > 0}
              className="flex-[2] bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all flex justify-center items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {uploading && <Loader2 className="animate-spin" size={18} />}
              {failedCount > 0 && !uploading && <RefreshCw size={18} />}
              {uploading
                ? "Zapisujem do Garminu…"
                : allUploaded
                ? "Zapísané do Garminu"
                : failedCount > 0
                ? `Skúsiť zapísať znova (${failedCount})`
                : "Schváliť a zapísať do Garminu"}
            </button>
          </div>
          {uploading && (
            // Poctivo priznáme, že zápis sa už zastaviť nedá — predtým sa tváril ako zrušiteľný.
            <p className="text-xs text-gray-500 text-center -mt-3">
              Zápis do Garminu prebieha a nedá sa prerušiť — počkaj, kým dobehne.
            </p>
          )}
        </motion.div>
      )}

    </div>
  );
}
