"use client";

import { useState, useEffect } from "react";
import { Calendar, CheckCircle2, Circle, Clock, Loader2, AlertCircle, Activity, Flame } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchScheduledPlan, fetchDailyUpdate, fetchWorkoutDetails } from "@/lib/api";

export default function Plan() {
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [detailsCache, setDetailsCache] = useState<Record<string, any>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});

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

  const handleExpand = async (index: number, workoutId: string) => {
    if (expandedId === index) {
      setExpandedId(null);
      return;
    }
    setExpandedId(index);
    if (!workoutId || detailsCache[workoutId] || loadingDetails[workoutId]) return;

    try {
      setLoadingDetails(prev => ({ ...prev, [workoutId]: true }));
      const res = await fetchWorkoutDetails(workoutId);
      if (res && res.workout) {
        setDetailsCache(prev => ({ ...prev, [workoutId]: res.workout }));
      }
    } catch (err) {
      console.error("Failed to load workout details", err);
    } finally {
      setLoadingDetails(prev => ({ ...prev, [workoutId]: false }));
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
            
            const details = detailsCache[workout.workoutId];
            const isLoadingDetails = loadingDetails[workout.workoutId];

            return (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                key={i} 
                onClick={() => handleExpand(i, workout.workoutId)}
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
                        {workout.description && (
                          <p className="whitespace-pre-line mb-3 pb-3 border-b border-white/5">{workout.description}</p>
                        )}
                        
                        {isLoadingDetails ? (
                          <div className="flex items-center gap-2 text-primary">
                            <Loader2 className="animate-spin" size={16} /> Načítavam kroky tréningu...
                          </div>
                        ) : details && details.workoutSegments ? (
                          <div className="flex flex-col gap-2">
                            {details.workoutSegments[0]?.workoutSteps?.map((step: any, stepIdx: number) => {
                              const stepType = step.stepType?.stepTypeKey || "run";
                              const distance = step.endConditionValue ? (step.endConditionValue / 1000).toFixed(1) + " km" : "";
                              
                              let targetStr = "";
                              if (step.targetType?.workoutTargetTypeKey === "speed.zone" && step.targetValueOne && step.targetValueTwo) {
                                // Convert m/s back to pace min/km
                                const ms1 = step.targetValueOne;
                                const ms2 = step.targetValueTwo;
                                const pace1Sec = Math.round(1000 / ms1);
                                const pace2Sec = Math.round(1000 / ms2);
                                
                                const p1m = Math.floor(pace1Sec / 60);
                                const p1s = (pace1Sec % 60).toString().padStart(2, '0');
                                const p2m = Math.floor(pace2Sec / 60);
                                const p2s = (pace2Sec % 60).toString().padStart(2, '0');
                                
                                targetStr = `${p1m}:${p1s} - ${p2m}:${p2s}/km`;
                              }

                              return (
                                <div key={stepIdx} className="flex justify-between items-center bg-black/20 p-2 rounded-lg">
                                  <div className="flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold text-gray-400">
                                      {step.stepOrder}
                                    </span>
                                    <span className="capitalize font-medium text-gray-200">
                                      {stepType === "warmup" ? "Zahriatie" : stepType === "interval" ? "Beh" : stepType === "recovery" ? "Oddych" : stepType === "cooldown" ? "Vychladnutie" : stepType}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-bold text-white">{distance}</p>
                                    {targetStr && <p className="text-xs text-primary font-mono">{targetStr}</p>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {details && details.description && !workout.description && (
                              <p className="whitespace-pre-line text-gray-300">{details.description}</p>
                            )}
                            <p className="italic text-gray-500">
                              {details && details.description ? "" : "Tento tréning nemá definované presné kroky v systéme."}
                            </p>
                          </div>
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
