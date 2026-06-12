"use client";

import { useEffect, useState } from "react";
import {
  Calendar, CheckCircle2, Circle, Clock, Loader2,
  Activity, Flame, ChevronRight, BarChart2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchDailyUpdateProposal, confirmDailyUpdate,
  fetchWorkoutDetails, fetchActivityStats
} from "@/lib/api";
import { useStore } from "@/lib/store";

const TRAINING_START = new Date("2026-06-01");
const TOTAL_WEEKS = 18;

function getTrainingWeek(): number {
  const diffMs = Date.now() - TRAINING_START.getTime();
  return Math.max(1, Math.min(TOTAL_WEEKS, Math.floor(diffMs / (7 * 24 * 3600 * 1000)) + 1));
}

// HR zóna farby pre tréningové kroky
const STEP_COLORS: Record<string, { border: string; text: string; label: string }> = {
  warmup:   { border: "border-l-orange-400", text: "text-orange-400",  label: "Rozcvička" },
  interval: { border: "border-l-rose-400",   text: "text-rose-400",    label: "Intervalový beh" },
  run:      { border: "border-l-blue-400",   text: "text-blue-400",    label: "Beh" },
  recovery: { border: "border-l-emerald-400",text: "text-emerald-400", label: "Zotavenie" },
  cooldown: { border: "border-l-green-400",  text: "text-green-400",   label: "Vychladenie" },
};

export default function Plan() {
  const store = useStore();
  const workouts = store.plan ?? [];
  const loading = store.planLoading;
  const error = store.planError;

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [detailsCache, setDetailsCache] = useState<Record<string, any>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [proposal, setProposal] = useState<any>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const trainingWeek = getTrainingWeek();
  const progressPct = Math.round((trainingWeek / TOTAL_WEEKS) * 100);

  useEffect(() => {
    store.loadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDailyUpdate = async () => {
    try {
      setIsUpdating(true);
      setUpdateMessage(null);
      setProposal(null);
      const res = await fetchDailyUpdateProposal();
      if (res?.status === "success") {
        setProposal(res);
      } else {
        setUpdateMessage({ type: "error", text: res?.message || "Nepodarilo sa nájsť tréning na úpravu." });
      }
    } catch (err: any) {
      setUpdateMessage({ type: "error", text: err.message || "Nepodarilo sa prepočítať tréning." });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmUpdate = async () => {
    if (!proposal) return;
    try {
      setIsConfirming(true);
      setUpdateMessage(null);
      const res = await confirmDailyUpdate(
        proposal.proposed_workout,
        proposal.old_workout_id,
        proposal.target_date_str
      );
      if (res?.status === "success") {
        setUpdateMessage({ type: "success", text: "Tréning bol úspešne upravený v Garmine!" });
        setProposal(null);
        await store.loadPlan(true);
      }
    } catch (err: any) {
      setUpdateMessage({ type: "error", text: err.message || "Nepodarilo sa uložiť tréning." });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleExpand = async (index: number, workout: any) => {
    const key = workout.workoutId || workout.activityId || String(index);
    if (expandedId === index) { setExpandedId(null); return; }
    setExpandedId(index);
    if (detailsCache[key] || loadingDetails[key]) return;

    setLoadingDetails((prev) => ({ ...prev, [key]: true }));
    try {
      const isCompleted = !!workout.activityId;
      if (isCompleted) {
        const res = await fetchActivityStats(workout.activityId);
        setDetailsCache((prev) => ({
          ...prev,
          [key]: res?.stats ? { type: "activity", ...res } : { type: "no_activity" },
        }));
      } else if (workout.workoutId) {
        const res = await fetchWorkoutDetails(workout.workoutId);
        setDetailsCache((prev) => ({
          ...prev,
          [key]: res?.workout ? { type: "planned", ...res.workout } : { type: "planned", description: "" },
        }));
      } else {
        setDetailsCache((prev) => ({ ...prev, [key]: { type: "planned", description: workout.description || "" } }));
      }
    } catch (err) {
      console.error("Failed to load details", err);
    } finally {
      setLoadingDetails((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (loading && workouts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen pb-24">
        <Loader2 className="animate-spin text-primary" size={48} />
        <p className="text-gray-400 mt-4 font-bold">Sťahujem tvoj plán...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pt-4 pb-24">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold mb-1">Tréningový Plán</h1>
          <p className="text-gray-400 text-sm">Hanson Advanced Half-Marathon</p>
        </div>
        <button
          onClick={() => (window.location.href = "/plan/generator")}
          className="bg-primary hover:bg-blue-600 text-white p-2 rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-colors"
        >
          Generátor
        </button>
      </header>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm font-bold break-words">
          ⚠️ {error}
        </div>
      )}

      {updateMessage && (
        <div
          className={`p-4 rounded-xl text-sm font-bold break-words border ${
            updateMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}
        >
          {updateMessage.text}
        </div>
      )}

      {/* Prepočítaj tréning */}
      {!proposal && (
        <button
          onClick={handleDailyUpdate}
          disabled={isUpdating}
          className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-primary p-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 border border-primary/20"
        >
          {isUpdating ? <Loader2 className="animate-spin" size={18} /> : <Activity size={18} />}
          {isUpdating ? "Prepočítavam podľa fyzičky..." : "Prepočítať najbližší tréning podľa fyzičky"}
        </button>
      )}

      {/* AI Proposal */}
      <AnimatePresence>
        {proposal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-card p-5 border border-primary/30 relative overflow-hidden"
          >
            <div className="absolute -top-10 -right-10 opacity-5">
              <Flame size={150} />
            </div>
            <h3 className="text-primary font-bold mb-2">Tréner radí</h3>
            <p className="text-gray-300 text-sm mb-4 italic leading-relaxed">
              "{proposal.coach_message}"
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                <p className="text-xs font-bold text-rose-400 uppercase mb-2">❌ Pôvodný tréning</p>
                <p className="font-bold">
                  {proposal.original_workout?.title || proposal.original_workout?.workoutName}
                </p>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                <p className="text-xs font-bold text-emerald-400 uppercase mb-2">✅ AI Návrh</p>
                <p className="font-bold">{proposal.proposed_workout?.workout_name}</p>
                <div className="mt-2 flex flex-col gap-1">
                  {proposal.proposed_workout?.steps?.map((s: any, idx: number) => (
                    <div key={idx} className="text-xs text-gray-300 flex justify-between bg-black/20 p-1.5 rounded">
                      <span className="capitalize">{s.type}</span>
                      <span>{s.distance_km}km @ {s.pace_max}-{s.pace_min}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setProposal(null)}
                disabled={isConfirming}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                Zrušiť
              </button>
              <button
                onClick={handleConfirmUpdate}
                disabled={isConfirming}
                className="flex-1 bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl text-sm transition-colors shadow-[0_0_15px_rgba(59,130,246,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isConfirming && <Loader2 className="animate-spin" size={18} />}
                {isConfirming ? "Ukladám..." : "Schváliť a nahrať"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      <div className="glass-card p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-bold">Progres prípravy</span>
          <span className="text-primary font-bold">
            Týždeň {trainingWeek} / {TOTAL_WEEKS}
          </span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-primary to-accent h-2 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1 text-right">{progressPct}% dokončené</p>
      </div>

      {/* Zoznam tréningov */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calendar className="text-primary" size={20} /> Garmin Kalendár
          </h2>
          <span className="bg-white/10 px-3 py-1 rounded-full text-xs">{workouts.length} tréningov</span>
        </div>

        <div className="flex flex-col gap-3">
          {workouts.length === 0 && !error && (
            <p className="text-center text-gray-500 my-8">
              Žiadne naplánované tréningy v tomto mesiaci.
            </p>
          )}

          {workouts.map((workout: any, i: number) => {
            const wDate = new Date(workout.date + "T00:00:00");
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isToday = wDate.getTime() === today.getTime();
            const isPast = wDate.getTime() < today.getTime();
            const isExpanded = expandedId === i;
            const key = workout.workoutId || workout.activityId || String(i);
            const details = detailsCache[key];
            const isLoadingDetails = loadingDetails[key];
            const days = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];

            return (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                key={i}
                onClick={() => handleExpand(i, workout)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  isToday
                    ? "bg-primary/20 border-primary shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                    : "glass-card hover:bg-white/5 border-transparent"
                } flex flex-col gap-2`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-center justify-center w-10 shrink-0">
                    <span className="text-xs text-gray-500 uppercase">{days[wDate.getDay()]}</span>
                    <span className={`font-bold ${isToday ? "text-primary" : "text-gray-300"}`}>
                      {wDate.getDate()}.
                    </span>
                  </div>

                  <div className="flex-1">
                    <h3 className={`font-bold ${isToday ? "text-white" : "text-gray-200"}`}>
                      {workout.title}
                    </h3>
                    <p className="text-xs text-gray-400">{workout.sportType?.typeKey || "Beh"}</p>
                  </div>

                  <div className="shrink-0">
                    {isPast && <CheckCircle2 className="text-emerald-400" size={22} />}
                    {isToday && <Clock className="text-primary" size={22} />}
                    {!isPast && !isToday && <Circle className="text-gray-600" size={22} />}
                  </div>
                </div>

                {/* Detail panel */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 pt-4 border-t border-white/10 text-sm text-gray-300">
                        {isLoadingDetails ? (
                          <div className="flex items-center gap-2 text-primary">
                            <Loader2 className="animate-spin" size={16} /> Načítavam dáta...
                          </div>
                        ) : details?.type === "activity" ? (
                          // ── Splnený beh: reálne štatistiky + porovnanie ──
                          <div className="flex flex-col gap-3">
                            <div className="grid grid-cols-2 gap-2">
                              {details.stats?.distance_km && (
                                <div className="bg-black/20 p-2 rounded-lg">
                                  <p className="text-xs text-gray-500">Vzdialenosť</p>
                                  <p className="font-bold text-white">{details.stats.distance_km} km</p>
                                </div>
                              )}
                              {details.stats?.avg_pace_sec_km && (
                                <div className="bg-black/20 p-2 rounded-lg">
                                  <p className="text-xs text-gray-500">Priem. tempo</p>
                                  <p className="font-bold text-primary font-mono">
                                    {Math.floor(details.stats.avg_pace_sec_km / 60)}:
                                    {String(details.stats.avg_pace_sec_km % 60).padStart(2, "0")}/km
                                  </p>
                                </div>
                              )}
                              {details.stats?.avg_hr && (
                                <div className="bg-black/20 p-2 rounded-lg">
                                  <p className="text-xs text-gray-500">Priem. tep</p>
                                  <p className="font-bold text-rose-400">{details.stats.avg_hr} bpm</p>
                                </div>
                              )}
                              {details.stats?.avg_cadence && (
                                <div className="bg-black/20 p-2 rounded-lg">
                                  <p className="text-xs text-gray-500">Kadencia</p>
                                  <p className="font-bold text-emerald-400">{details.stats.avg_cadence} spm</p>
                                </div>
                              )}
                              {details.stats?.calories && (
                                <div className="bg-black/20 p-2 rounded-lg">
                                  <p className="text-xs text-gray-500">Kalórie</p>
                                  <p className="font-bold text-orange-400">{details.stats.calories} kcal</p>
                                </div>
                              )}
                              {details.stats?.training_effect && (
                                <div className="bg-black/20 p-2 rounded-lg">
                                  <p className="text-xs text-gray-500">Aeróbny efekt</p>
                                  <p className="font-bold text-purple-400">
                                    {details.stats.training_effect.toFixed(1)}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : details?.type === "no_activity" ? (
                          <p className="italic text-gray-500">
                            Aktivita sa nenachádza v Garmine (možno ešte nebola synchronizovaná).
                          </p>
                        ) : details?.type === "planned" ? (
                          // ── Plánovaný tréning: kroky so zónovými farbami ──
                          <div className="flex flex-col gap-3">
                            {details.total_distance_km && (
                              <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-bold">{details.total_distance_km}</span>
                                <span className="text-gray-400 text-sm">km celkom</span>
                              </div>
                            )}
                            {details.description && (
                              <div className="bg-black/20 rounded-xl p-3">
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">
                                  Poznámky
                                </p>
                                <p className="text-sm text-gray-300 leading-relaxed">{details.description}</p>
                              </div>
                            )}
                            {details.steps_summary?.length > 0 && (
                              <div className="flex flex-col gap-2">
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Kroky</p>
                                {details.steps_summary.map((step: any, si: number) => {
                                  const c = STEP_COLORS[step.type] || {
                                    border: "border-l-primary",
                                    text: "text-primary",
                                    label: step.type,
                                  };
                                  return (
                                    <div
                                      key={si}
                                      className={`bg-black/20 rounded-xl border-l-4 ${c.border} p-3`}
                                    >
                                      <div className="flex items-start justify-between mb-1">
                                        <span className={`font-bold text-sm ${c.text}`}>{c.label}</span>
                                        {step.distance_km && (
                                          <span className="text-gray-400 text-xs">{step.distance_km} km</span>
                                        )}
                                      </div>
                                      {step.target && (
                                        <p className="text-xs text-gray-400 mb-1">
                                          {step.target_kind === "hr" ? "❤️" : "⏱"} {step.target}
                                        </p>
                                      )}
                                      {step.notes && (
                                        <p className="text-xs text-gray-500 italic">{step.notes}</p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {!details.description && !details.steps_summary?.length && (
                              <p className="italic text-gray-500 text-sm">
                                K tomuto tréningu nie je uložený popis.
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="italic text-gray-500">
                            {workout.description || "Kliknutím načítam detaily tréningu."}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
