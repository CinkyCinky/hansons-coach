"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, Send, Calendar as CalIcon, Bot, CheckCircle2, MessageCircle, Repeat, Info } from "lucide-react";
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

// Jeden editovateľný krok tréningu (vzdialenosť + tempo alebo HR). Použité aj vnútri repeat-blokov.
function StepRow({ s, onField }: { s: any; onField: (field: string, value: any) => void }) {
  const isHr = s.hr_min != null || s.hr_max != null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs bg-white/5 p-2 rounded-lg">
      <span className="font-bold text-gray-300 w-20 shrink-0">{STEP_LABELS[s.type] ?? s.type}</span>
      <span className="flex items-center gap-1">
        <input
          type="number" step="0.1" inputMode="decimal" value={s.distance_km ?? ""}
          onChange={(e) => onField("distance_km", e.target.value === "" ? null : parseFloat(e.target.value))}
          className={`w-16 ${STEP_INPUT}`}
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
            onChange={(e) => onField("pace_min", e.target.value)} className={`w-14 ${STEP_INPUT}`} />
          <span>–</span>
          <input value={s.pace_max ?? ""} placeholder="5:10"
            onChange={(e) => onField("pace_max", e.target.value)} className={`w-14 ${STEP_INPUT}`} />
          <span className="text-gray-500" title="tempo v min:sek na kilometer (pomalší–rýchlejší okraj)">min/km</span>
        </span>
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
  const [uploadSuccess, setUploadSuccess] = useState(false);

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
    setUploadSuccess(false);
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

  const handleUpload = async () => {
    setUploading(true);
    setError(null);
    try {
      const res = await uploadPlan(generatedPlan);
      // Zneplatni cache, aby sa nové tréningy hneď zobrazili v Pláne a na Prehľade
      store.invalidateAll();
      const failedList: any[] = res?.failed ?? [];
      const firstReason: string | undefined = failedList[0]?.reason;
      if (res?.status === "error") {
        setError(
          firstReason
            ? `Nepodarilo sa zapísať tréningy. Dôvod: ${firstReason}`
            : (res?.message || "Nepodarilo sa zapísať žiadny tréning. Skús to znova.")
        );
      } else {
        if (failedList.length > 0) {
          const dni = failedList.map((f) => f.date).join(", ");
          setError(`Časť tréningov sa nezapísala (${dni})${firstReason ? `. Dôvod: ${firstReason}` : ""}. Ostatné sú v Garmine.`);
        }
        setUploadSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || "Chyba pri nahrávaní do Garminu.");
    } finally {
      setUploading(false);
    }
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

  return (
    <div className="flex flex-col gap-6 pt-4 pb-32">
      <header className="flex items-center gap-3">
        <Link href="/plan">
          <ArrowLeft className="text-gray-400 hover:text-white" />
        </Link>
        <h1 className="text-2xl font-bold">Generátor tréningov</h1>
      </header>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm font-bold break-words">
          Chyba: {error}
        </div>
      )}

      {uploadSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-sm font-bold flex items-center gap-2">
          <CheckCircle2 /> Plán bol úspešne nahratý a naplánovaný v tvojom Garmin kalendári!
        </div>
      )}

      {!generatedPlan && !loading && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
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
                          <span>Tempo / HMP (pretekové)</span><span className="text-right font-mono text-amber-300">{generatedPlan.paces.tempo}/km</span>
                          <span>Strength</span><span className="text-right font-mono text-orange-300">{generatedPlan.paces.strength}/km</span>
                          <span>Speed</span><span className="text-right font-mono text-rose-300">{generatedPlan.paces.speed}/km</span>
                        </>
                      )}
                    </div>
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
              {generatedPlan.workouts?.length === 1 ? "tréning" : "tréningy/-ov"} • tento týždeň)
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Pred zápisom do Garminu môžeš upraviť názvy, vzdialenosti, tempá aj tepy.
            </p>
            <div className="flex flex-col gap-3">
              {generatedPlan.workouts.map((w: any, idx: number) => (
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
                    {w.steps.map((s: any, s_idx: number) =>
                      s.type === "repeat" && Array.isArray(s.steps) ? (
                        <div key={s_idx} className="bg-white/5 rounded-lg p-2 border border-accent/20">
                          <div className="flex items-center gap-2 text-xs font-bold text-accent mb-2">
                            <Repeat size={13} />
                            <input
                              type="number" inputMode="numeric" min={1} value={s.iterations ?? 1}
                              onChange={(e) => updateRepeatIterations(idx, s_idx, e.target.value === "" ? 1 : parseInt(e.target.value))}
                              className={`w-12 ${STEP_INPUT}`}
                            />
                            <span>× opakovať</span>
                          </div>
                          <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent/20">
                            {s.steps.map((ns: any, n_idx: number) => (
                              <StepRow key={n_idx} s={ns} onField={(f, v) => updateStep(idx, s_idx, f, v, n_idx)} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <StepRow key={s_idx} s={s} onField={(f, v) => updateStep(idx, s_idx, f, v)} />
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={() => setGeneratedPlan(null)}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-all"
            >
              Zrušiť
            </button>
            <button 
              onClick={handleUpload}
              disabled={uploading || uploadSuccess}
              className="flex-[2] bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all flex justify-center items-center gap-2"
            >
              {uploading && <Loader2 className="animate-spin" size={18} />}
              {uploadSuccess ? "Nahraté" : "Schváliť a zapísať do Garminu"}
            </button>
          </div>
        </motion.div>
      )}

    </div>
  );
}
