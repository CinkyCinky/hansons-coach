"use client";

import { Calendar, CheckCircle2, Circle, Clock } from "lucide-react";
import { motion } from "framer-motion";

export default function Plan() {
  const weekDays = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
  
  const currentWeek = [
    { day: "Po", date: "2. Jún", status: "rest", title: "Voľno", distance: "0 km" },
    { day: "Ut", date: "3. Jún", status: "missed", title: "Easy Run", distance: "6.4 km" },
    { day: "St", date: "4. Jún", status: "done", title: "Easy Run + Kadencia", distance: "5.8 km" },
    { day: "Št", date: "5. Jún", status: "done", title: "Rozcvička + Beh", distance: "4.8 km" },
    { day: "Pi", date: "6. Jún", status: "today", title: "Easy Run Z2", distance: "4.8 km" },
    { day: "So", date: "7. Jún", status: "future", title: "Long Run Z2", distance: "9.6 km" },
    { day: "Ne", date: "8. Jún", status: "future", title: "Tenis", distance: "1 h" },
  ];

  return (
    <div className="flex flex-col gap-6 pt-4 pb-10">
      <header>
        <h1 className="text-3xl font-bold mb-1">Tréningový Plán</h1>
        <p className="text-gray-400 text-sm">Hanson Advanced Half-Marathon</p>
      </header>

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

      {/* Current Week */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calendar className="text-primary" size={20} /> Týždeň 1
          </h2>
          <span className="bg-white/10 px-3 py-1 rounded-full text-xs">27 km</span>
        </div>

        <div className="flex flex-col gap-3">
          {currentWeek.map((day, i) => (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              key={i} 
              className={`p-4 rounded-2xl border ${
                day.status === "today" 
                  ? "bg-primary/20 border-primary shadow-[0_0_15px_rgba(59,130,246,0.15)]" 
                  : "glass-card border-transparent"
              } flex items-center gap-4`}
            >
              <div className="flex flex-col items-center justify-center w-10 shrink-0">
                <span className="text-xs text-gray-500 uppercase">{day.day}</span>
                <span className={`font-bold ${day.status === "today" ? "text-primary" : "text-gray-300"}`}>{day.date.split('.')[0]}</span>
              </div>
              
              <div className="flex-1">
                <h3 className={`font-bold ${day.status === "today" ? "text-white" : "text-gray-200"}`}>{day.title}</h3>
                <p className="text-xs text-gray-400">{day.distance}</p>
              </div>

              <div className="shrink-0">
                {day.status === "done" && <CheckCircle2 className="text-emerald-400" size={24} />}
                {day.status === "today" && <Clock className="text-primary" size={24} />}
                {day.status === "future" && <Circle className="text-gray-600" size={24} />}
                {day.status === "rest" && <span className="text-xs text-gray-500 uppercase font-bold">Zzz</span>}
                {day.status === "missed" && <Circle className="text-rose-500" size={24} />}
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
