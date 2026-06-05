"use client";

import { useState, useEffect } from "react";
import { Calendar, CheckCircle2, Circle, Clock, Loader2, AlertCircle, Activity, Flame } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchScheduledPlan, fetchDailyUpdate, fetchWorkoutDetails, fetchActivityStats } from "@/lib/api";

export default function Plan() {
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [detailsCache, setDetailsCache] = useState<Record<string, any>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>();

  useEffect(() => {
    async function loadPlan() {
      try {
        setError(null);
        const data = await fetchScheduledPlan();
        if (data && data.workouts) {
          // Zoradime podla datumu
          const sorted = data.workouts.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
          setWorkouts(sorted);
        }
      } catch (err: any) {
        setError(err.message || "Nepodarilo sa načítať plán");
      } finally {
        setLoading(false);
      }
    }
    loadPlan();
  }, []);

  const handleDailyUpdate = async () => {
    try {
      setIsUpdating(true);
      setUpdateMessage(null);
      const res = await fetchDailyUpdate();
      if (res && res.status === "success") {
        setUpdateMessage({ type: 'success', text: res.message || "Tréning na zajtra bol úspešne upravený!" });
        // Znova načítame plán
        const data = await fetchScheduledPlan();
        if (data && data.workouts) {
          const sorted = data.workouts.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
          setWorkouts(sorted);
        }
      } else {
        setUpdateMessage({ type: 'error', text: res?.message || "Nepodarilo sa nájsť tréning na úpravu." });
      }
    } catch (err: any) {
      setUpdateMessage({ type: 'error', text: err.message || "Nepodarilo sa prepočítať tréning." });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleExpand = async (index: number, workout: any, isPast: boolean) => {
    const key = workout.workoutId || workout.activityId || String(index);
    if (expandedId === index) {
      setExpandedId(null);
      return;
    }
    setExpandedId(index);
    if (detailsCache[key] || loadingDetails?.[key]) return;

    try {
      setLoadingDetails(prev => ({ ...prev, [key]: true }));
      
      if (isPast && workout.activityId) {
        // For past runs: load real activity stats
        const res = await fetchActivityStats(workout.activityId);
        if (res && res.stats) {
          setDetailsCache(prev => ({ ...prev, [key]: { type: 'activity', ...res } }));
        }
      } else if (!isPast && workout.workoutId) {
        // For future runs: load workout definition (description + planned steps)
        const res = await fetchWorkoutDetails(workout.workoutId);
        if (res && res.workout) {
          setDetailsCache(prev => ({ ...prev, [key]: { type: 'planned', ...res.workout } }));
        }
      }
    } catch (err) {
      console.error("Failed to load details", err);
    } finally {
      setLoadingDetails(prev => ({ ...prev, [key]: false }));
    }
  };

  if (loading) {
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
          onClick={() => window.location.href = "/plan/generator"}
          className="bg-primary hover:bg-blue-600 text-white p-2 rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-colors"
        >
          Generátor
        </button>
      </header>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm font-bold break-words">
          Chyba: {error}
        </div>
      )}

      {updateMessage && (
        <div className={`p-4 rounded-xl text-sm font-bold break-words border ${updateMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
          {updateMessage.text}
        </div>
      )}

      <div className="flex w-full">
        <button 
          onClick={handleDailyUpdate}
          disabled={isUpdating}
          className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-primary p-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 border border-primary/20"
        >
          {isUpdating ? <Loader2 className="animate-spin" size={18} /> : <Activity size={18} />}
          {isUpdating ? "Prepočítavam podľa fyzičky..." : "Prepočítať najbližší tréning podľa fyzičky"}
        </button>
      </div>

      {/* Progress Bar */}
      <div className="glass-card p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-bold">Progres plánu</span>
          <span className="text-primary font-bold">1 / 18 týždňov</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div className="bg-gradient-to-r from-primary to-accent h-2 rounded-full" style={{ width: '5%' }}></div>
        </div>
      </div>

      {/* Workouts List */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calendar className="text-primary" size={20} /> Garmin Kalendár
          </h2>
          <span className="bg-white/10 px-3 py-1 rounded-full text-xs">{workouts.length} aktivít</span>
        </div>

        <div className="flex flex-col gap-3">
          {workouts.length === 0 && !error && (
            <p className="text-center text-gray-500 my-8">Žiadne naplánované tréningy v tomto mesiaci.</p>
          )}

          {workouts.map((workout: any, i: number) => {
            const wDate = new Date(workout.date);
            const today = new Date();
            today.setHours(0,0,0,0);
            const isToday = wDate.getTime() === today.getTime();
            const isPast = wDate.getTime() < today.getTime();
            const isExpanded = expandedId === i;
            
            const days = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];
            const dayName = days[wDate.getDay()];
            const dayNum = wDate.getDate();
            
            const details = detailsCache[workout.workoutId || workout.activityId || String(i)];
            const isLoadingDetails = loadingDetails?.[workout.workoutId || workout.activityId || String(i)];

            return (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                key={i} 
                onClick={() => handleExpand(i, workout, isPast)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  isToday 
                    ? "bg-primary/20 border-primary shadow-[0_0_15px_rgba(59,130,246,0.15)]" 
                    : "glass-card hover:bg-white/5 border-transparent"
                } flex flex-col gap-2`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-center justify-center w-10 shrink-0">
                    <span className="text-xs text-gray-500 uppercase">{dayName}</span>
                    <span className={`font-bold ${isToday ? "text-primary" : "text-gray-300"}`}>{dayNum}.</span>
                  </div>
                  
                  <div className="flex-1">
                    <h3 className={`font-bold ${isToday ? "text-white" : "text-gray-200"}`}>{workout.title}</h3>
                    <p className="text-xs text-gray-400">{workout.sportType?.typeKey || "Beh"}</p>
                  </div>

                  <div className="shrink-0">
                    {isPast && <CheckCircle2 className="text-emerald-400" size={24} />}
                    {isToday && <Clock className="text-primary" size={24} />}
                    {!isPast && !isToday && <Circle className="text-gray-600" size={24} />}
                  </div>
                </div>

                {/* Rozbalene detaily */}
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
                        ) : details?.type === 'activity' ? (
                          // PAST WORKOUT: show real stats
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
                                    {Math.floor(details.stats.avg_pace_sec_km / 60)}:{String(details.stats.avg_pace_sec_km % 60).padStart(2,'0')}/km
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
                                  <p className="font-bold text-purple-400">{details.stats.training_effect.toFixed(1)}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : details?.type === 'planned' ? (
                          // FUTURE WORKOUT: show planned description
                          <div className="flex flex-col gap-2">
                            {(details.description || workout.description) && (
                              <p className="whitespace-pre-line text-gray-300">{details.description || workout.description}</p>
                            )}
                            {!details.description && !workout.description && (
                              <p className="italic text-gray-500">K tomuto tréningu nie je uložený popis.</p>
                            )}
                          </div>
                        ) : (
                          <p className="italic text-gray-500">{isPast ? "Aktivita sa nenašla v Garmine." : (workout.description || "K tomuto tréningu nie je uložený popis.")}</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </motion.div>
            )
          })}
        </div>
      </section>
    </div>
  );
}
