"use client";

import { useState, useEffect } from "react";
import { Moon, Heart, Battery, Activity, Flame, ChevronRight, Loader2, Bot } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { fetchDashboard, fetchDashboardAdvice } from "@/lib/api";

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [advice, setAdvice] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const dashboardData = await fetchDashboard();
        setData(dashboardData);
        
        // Fetch advice in the background
        if (dashboardData) {
          try {
            const adviceData = await fetchDashboardAdvice({
              sleep_score: dashboardData.sleep?.score,
              hrv_status: dashboardData.hrv?.status,
              body_battery: dashboardData.stats?.body_battery_highest,
              readiness: dashboardData.readiness?.readiness_score
            });
            setAdvice(adviceData.advice);
          } catch (e) {
            console.error("Failed to load advice", e);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Loader2 className="animate-spin text-primary" size={48} />
        <p className="text-gray-400 mt-4 font-bold">Oživujem trénera...</p>
      </div>
    );
  }

  // Prehlad (ak data zlyhaju pouzijeme fallback)
  const d = data || {};
  const sleep = d.sleep || { duration_hours: 0, score: 0 };
  const hrv = d.hrv || { status: 'N/A', last_night_avg: 0 };
  const stats = d.stats || { body_battery_highest: 0 };
  const readiness = d.readiness || { readiness_score: 0, readiness_status: 'N/A' };
  const lastActivity = (d.activities && d.activities.length > 0) ? d.activities[0] : null;
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

      {/* AI Advice */}
      {data && (
        <motion.section 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 relative overflow-hidden"
        >
          <div className="absolute -right-6 -bottom-6 opacity-5">
            <Bot size={100} />
          </div>
          <div className="flex gap-3 relative z-10">
            <div className="mt-1 bg-blue-500/20 p-2 rounded-xl text-primary flex-shrink-0 h-min">
              <Bot size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-1">Tréner radí</h3>
              {advice ? (
                <p className="text-sm text-gray-200 leading-relaxed font-medium">{advice}</p>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-400 mt-1">
                  <Loader2 size={14} className="animate-spin" /> Tréner analyzuje tvoj stav...
                </div>
              )}
            </div>
          </div>
        </motion.section>
      )}

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
            <p className="text-2xl font-bold">{sleep.duration_hours > 0 ? sleep.duration_hours.toFixed(1) : '--'}h</p>
            <p className="text-xs text-gray-400 mt-1">Skóre: <span className="text-green-400 font-bold">{sleep.score || '--'}</span></p>
          </motion.div>

          {/* HRV */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2 text-rose-400">
              <Heart size={18} />
              <span className="font-bold text-sm">HRV</span>
            </div>
            <p className="text-xl font-bold">{hrv.status === 'N/A' ? '--' : hrv.status}</p>
            <p className="text-xs text-gray-400 mt-1">{hrv.last_night_avg || '--'} ms avg</p>
          </motion.div>

          {/* Body Battery */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2 text-emerald-400">
              <Battery size={18} />
              <span className="font-bold text-sm">Body Battery</span>
            </div>
            <p className="text-2xl font-bold">{stats.body_battery_highest || '--'}%</p>
            <div className="w-full bg-gray-800 rounded-full h-1.5 mt-2">
              <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: `${stats.body_battery_highest || 0}%` }}></div>
            </div>
          </motion.div>

          {/* Readiness */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2 text-amber-400">
              <Activity size={18} />
              <span className="font-bold text-sm">Pripravenosť</span>
            </div>
            <p className="text-2xl font-bold">{readiness.readiness_score || '--'}</p>
            <p className="text-xs text-gray-400 mt-1 truncate">{readiness.readiness_status}</p>
          </motion.div>
        </div>
      </section>

      {/* Last Run */}
      <section className="mb-8">
        <Link href="/reports">
          <div className="glass-card p-4 flex items-center justify-between group hover:border-primary/50 transition-colors">
            {lastActivity ? (
              <div>
                <p className="text-xs text-gray-400 mb-1">Posledná aktivita</p>
                <h4 className="font-bold text-sm">{lastActivity.activityName}</h4>
                <p className="text-xs text-gray-500 mt-1">
                  {(lastActivity.distance / 1000).toFixed(1)} km • 
                  {lastActivity.averageSpeed ? (1000 / lastActivity.averageSpeed / 60).toFixed(2).replace('.', ':') : '--'}/km • 
                  {lastActivity.averageHR || '--'} bpm
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-gray-400 mb-1">Posledná aktivita</p>
                <h4 className="font-bold text-sm text-gray-600">Žiadne dáta</h4>
              </div>
            )}
            <ChevronRight size={20} className="text-gray-500 group-hover:text-primary transition-colors" />
          </div>
        </Link>
      </section>
    </div>
  );
}
