"use client";

import { useEffect } from "react";
import {
  Moon, Heart, Battery, Activity, Flame, ChevronRight,
  Loader2, Bot, RefreshCcw, Zap, TrendingUp
} from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";

function getFormStatus(sleepScore?: number, bodyBattery?: number, readiness?: number) {
  const values = [sleepScore, bodyBattery, readiness].filter((v) => v != null) as number[];
  if (!values.length) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg >= 70) return { label: "Skvelá forma", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "🟢" };
  if (avg >= 45) return { label: "Dobrá forma", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", dot: "🟡" };
  return { label: "Potrebuješ odpočinok", color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20", dot: "🔴" };
}

function formatDate(): string {
  return new Date().toLocaleDateString("sk-SK", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function Dashboard() {
  const store = useStore();

  useEffect(() => {
    store.loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    store.invalidateAll();
    await store.loadDashboard(true);
  };

  // Týždeň prípravy pochádza z backendu (počítaný z profilu)
  const { dashboard: data, dashboardLoading: loading, dashboardError: error, advice } = store;
  const trainingWeek = data?.training_week ?? "?";
  const TOTAL_WEEKS = 18;

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Loader2 className="animate-spin text-primary" size={48} />
        <p className="text-gray-400 mt-4 font-bold">Oživujem trénera...</p>
      </div>
    );
  }

  const d = data || {};
  const sleep = d.sleep || {};
  const hrv = d.hrv || {};
  const stats = d.stats || {};
  const readiness = d.readiness || {};
  const lastActivity = d.activities?.[0] ?? null;
  const todayWorkout = d.today_workout ?? null;

  const formStatus = getFormStatus(sleep.score, stats.body_battery, readiness.readiness_score);

  return (
    <div className="flex flex-col gap-5 pt-4 pb-32">
      {/* Header */}
      <header className="flex justify-between items-end">
        <div>
          <p className="text-gray-400 text-sm font-medium capitalize">{formatDate()}</p>
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-300">
            Ahoj, {data?.display_name ?? data?.garmin_email?.split("@")[0] ?? "Bežec"} 👋
          </h1>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="bg-gray-800 p-2 rounded-full text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Načítať znovu z Garminu"
          >
            <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <div className="bg-accent/20 text-accent px-3 py-1 rounded-full text-xs font-bold border border-accent/30 shadow-[0_0_15px_rgba(249,115,22,0.2)]">
            T{trainingWeek} / {TOTAL_WEEKS}
          </div>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm font-bold break-words">
          ⚠️ {error}
          <p className="text-xs font-normal mt-1 text-rose-400/80">
            Skontroluj Garmin prihlásenie v Nastaveniach alebo stlač Refresh.
          </p>
        </div>
      )}

      {/* Stav formy */}
      {formStatus && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`${formStatus.bg} border rounded-2xl px-4 py-3 flex items-center gap-3`}
        >
          <span className="text-2xl">{formStatus.dot}</span>
          <div>
            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Stav formy</p>
            <p className={`font-bold ${formStatus.color}`}>{formStatus.label}</p>
          </div>
        </motion.div>
      )}

      {/* Dnešný tréning */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-5 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Flame size={120} />
        </div>

        <p className="text-primary font-bold text-sm mb-1 uppercase tracking-wider">Dnešný tréning</p>

        {todayWorkout ? (
          <>
            <h2 className="text-2xl font-bold mb-1">{todayWorkout.title || "Tréning"}</h2>
            <p className="text-gray-400 text-sm mb-4 max-w-[80%]">
              {todayWorkout.description || "Pozri detail v sekcii Plán."}
            </p>
            <Link href="/plan">
              <span className="inline-flex items-center gap-1 text-primary text-sm font-bold">
                Zobraziť detail <ChevronRight size={16} />
              </span>
            </Link>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-1 text-gray-300">Žiadny tréning naplánovaný</h2>
            <p className="text-gray-500 text-sm mb-4">Dnes je voľný deň alebo nebol nájdený tréning v Garmine.</p>
            <Link href="/plan">
              <span className="inline-flex items-center gap-1 text-primary text-sm font-bold">
                Pozrieť plán <ChevronRight size={16} />
              </span>
            </Link>
          </>
        )}
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

      {/* Metriky — 2×2 grid */}
      <section>
        <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
          <Activity size={20} className="text-gray-400" /> Ranný Report
        </h3>

        <div className="grid grid-cols-2 gap-3">
          {/* Spánok */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 }}
            className="glass-card p-4"
          >
            <div className="flex items-center gap-2 mb-2 text-indigo-400">
              <Moon size={18} />
              <span className="font-bold text-sm">Spánok</span>
            </div>
            <p className="text-2xl font-bold">
              {sleep.duration_hours ? `${sleep.duration_hours.toFixed(1)}h` : "--"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Skóre: <span className="text-indigo-300 font-bold">{sleep.score ?? "--"}</span>
            </p>
          </motion.div>

          {/* HRV */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="glass-card p-4"
          >
            <div className="flex items-center gap-2 mb-2 text-rose-400">
              <Heart size={18} />
              <span className="font-bold text-sm">HRV</span>
            </div>
            <p className="text-xl font-bold">
              {hrv.last_night ? `${hrv.last_night} ms` : hrv.status !== "unknown" ? hrv.status : "--"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Avg: <span className="text-rose-300 font-bold">{hrv.weekly_avg ?? "--"} ms</span>
            </p>
          </motion.div>

          {/* Body Battery */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            className="glass-card p-4"
          >
            <div className="flex items-center gap-2 mb-2 text-emerald-400">
              <Battery size={18} />
              <span className="font-bold text-sm">Body Battery</span>
            </div>
            <p className="text-2xl font-bold">{stats.body_battery ?? "--"}</p>
            <div className="w-full bg-gray-800 rounded-full h-1.5 mt-2">
              <div
                className="bg-emerald-400 h-1.5 rounded-full transition-all"
                style={{ width: `${stats.body_battery ?? 0}%` }}
              />
            </div>
          </motion.div>

          {/* Pokojový tep */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="glass-card p-4"
          >
            <div className="flex items-center gap-2 mb-2 text-amber-400">
              <Zap size={18} />
              <span className="font-bold text-sm">Pokojový tep</span>
            </div>
            <p className="text-2xl font-bold">
              {stats.resting_hr ? `${stats.resting_hr}` : "--"}
            </p>
            <p className="text-xs text-gray-400 mt-1">bpm</p>
          </motion.div>
        </div>

        {/* Pripravenosť — full width */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25 }}
          className="glass-card p-4 mt-3"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sky-400">
              <TrendingUp size={18} />
              <span className="font-bold text-sm">Pripravenosť na tréning</span>
            </div>
            <span className="text-2xl font-bold text-sky-300">{readiness.readiness_score ?? "--"}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-sky-500 to-blue-400 h-2 rounded-full transition-all"
              style={{ width: `${readiness.readiness_score ?? 0}%` }}
            />
          </div>
          {readiness.readiness_status && (
            <p className="text-xs text-gray-400 mt-2 truncate">{readiness.readiness_status}</p>
          )}
        </motion.div>
      </section>

      {/* Posledná aktivita */}
      <section className="mb-8">
        <Link href="/plan">
          <div className="glass-card p-4 flex items-center justify-between group hover:border-primary/50 transition-colors cursor-pointer">
            {lastActivity ? (
              <div>
                <p className="text-xs text-gray-400 mb-1">Posledná aktivita</p>
                <h4 className="font-bold text-sm">{lastActivity.activityName}</h4>
                <p className="text-xs text-gray-500 mt-1">
                  {((lastActivity.distance || 0) / 1000).toFixed(1)} km
                  {lastActivity.averageSpeed
                    ? ` • ${Math.floor(1000 / lastActivity.averageSpeed / 60)}:${String(Math.round((1000 / lastActivity.averageSpeed) % 60)).padStart(2, "0")}/km`
                    : ""}
                  {lastActivity.averageHR ? ` • ${lastActivity.averageHR} bpm` : ""}
                  {lastActivity.averageRunningCadenceInStepsPerMinute
                    ? ` • ${lastActivity.averageRunningCadenceInStepsPerMinute} spm`
                    : ""}
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
