"use client";

import { Moon, Heart, Battery, Activity, Flame, ChevronRight } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function Dashboard() {
  return (
    <div className="flex flex-col gap-6 pt-4">
      {/* Header */}
      <header className="flex justify-between items-end">
        <div>
          <p className="text-gray-400 text-sm font-medium">Piatok, 5. Jún 2026</p>
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-300">
            Ahoj, Maroš 👋
          </h1>
        </div>
        <div className="bg-accent/20 text-accent px-3 py-1 rounded-full text-xs font-bold border border-accent/30 shadow-[0_0_15px_rgba(249,115,22,0.2)]">
          Týždeň 1 z 18
        </div>
      </header>

      {/* Main Action Card */}
      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-5 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Flame size={120} />
        </div>
        
        <p className="text-primary font-bold text-sm mb-1 uppercase tracking-wider">Dnešný tréning</p>
        <h2 className="text-2xl font-bold mb-1">Easy Run 5km Z2</h2>
        <p className="text-gray-400 text-sm mb-6 max-w-[80%]">T1-Pi | Ľahký regeneračný beh. Udržuj tepy pod 140 bpm.</p>
        
        <div className="flex gap-4 mb-6">
          <div>
            <p className="text-xs text-gray-500 uppercase">Vzdialenosť</p>
            <p className="font-bold">4.8 km</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Tempo</p>
            <p className="font-bold">6:30/km</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Cieľový tep</p>
            <p className="font-bold text-primary">119-138</p>
          </div>
        </div>
        
        <button className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)]">
          Spustiť v Garmin
        </button>
      </motion.section>

      {/* Metrics Grid */}
      <section>
        <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
          <Activity size={20} className="text-gray-400" /> Ranný Report
        </h3>
        
        <div className="grid grid-cols-2 gap-3">
          {/* Sleep */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2 text-indigo-400">
              <Moon size={18} />
              <span className="font-bold text-sm">Spánok</span>
            </div>
            <p className="text-2xl font-bold">8.1h</p>
            <p className="text-xs text-gray-400 mt-1">Skóre: <span className="text-green-400 font-bold">74</span></p>
          </motion.div>

          {/* HRV */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2 text-rose-400">
              <Heart size={18} />
              <span className="font-bold text-sm">HRV</span>
            </div>
            <p className="text-xl font-bold">Vyvážený</p>
            <p className="text-xs text-gray-400 mt-1">50 ms avg</p>
          </motion.div>

          {/* Body Battery */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2 text-emerald-400">
              <Battery size={18} />
              <span className="font-bold text-sm">Body Battery</span>
            </div>
            <p className="text-2xl font-bold">55%</p>
            <div className="w-full bg-gray-800 rounded-full h-1.5 mt-2">
              <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: '55%' }}></div>
            </div>
          </motion.div>

          {/* Readiness */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2 text-amber-400">
              <Activity size={18} />
              <span className="font-bold text-sm">Pripravenosť</span>
            </div>
            <p className="text-2xl font-bold">57%</p>
            <p className="text-xs text-gray-400 mt-1">Mierna záťaž</p>
          </motion.div>
        </div>
      </section>

      {/* Last Run */}
      <section className="mb-8">
        <Link href="/reports">
          <div className="glass-card p-4 flex items-center justify-between group hover:border-primary/50 transition-colors">
            <div>
              <p className="text-xs text-gray-400 mb-1">Včera</p>
              <h4 className="font-bold text-sm">Easy Run + Kadencia</h4>
              <p className="text-xs text-gray-500 mt-1">5.2 km • 9:17/km • 136 bpm</p>
            </div>
            <ChevronRight size={20} className="text-gray-500 group-hover:text-primary transition-colors" />
          </div>
        </Link>
      </section>
    </div>
  );
}
