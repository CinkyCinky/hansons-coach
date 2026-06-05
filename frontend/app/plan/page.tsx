"use client";

import { useState, useEffect } from "react";
import { Calendar, CheckCircle2, Circle, Clock, Loader2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchScheduledPlan } from "@/lib/api";

export default function Plan() {
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

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

            return (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                key={i} 
                onClick={() => setExpandedId(isExpanded ? null : i)}
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
                        {workout.description ? (
                          <p className="whitespace-pre-line">{workout.description}</p>
                        ) : (
                          <p className="italic text-gray-500">Žiadny detailný popis.</p>
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
