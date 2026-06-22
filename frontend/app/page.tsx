"use client";

import { useEffect, useState } from "react";
import {
  Moon, Heart, Battery, Activity, Flame, ChevronRight,
  Loader2, Bot, RefreshCcw, Zap, TrendingUp, Info
} from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { classifyWorkout } from "@/lib/workoutType";

function getFormStatus(sleepScore?: number, bodyBattery?: number, readiness?: number) {
  const values = [sleepScore, bodyBattery, readiness].filter((v) => v != null) as number[];
  if (!values.length) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg >= 70) return { label: "Skvelá forma", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "🟢" };
  if (avg >= 45) return { label: "Dobrá forma", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", dot: "🟡" };
  return { label: "Potrebuješ odpočinok", color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20", dot: "🔴" };
}

function getLoadStatus(ratio?: number | null) {
  if (ratio == null) return null;
  if (ratio > 1.5) return { label: "Vysoké riziko preťaženia", color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20", dot: "🔴" };
  if (ratio > 1.4) return { label: "Zvýšená záťaž — opatrne", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", dot: "🟠" };
  if (ratio >= 0.8) return { label: "Optimálna záťaž", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "🟢" };
  return { label: "Podtrénovanie — priestor pridať", color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20", dot: "🔵" };
}

function formatDate(): string {
  return new Date().toLocaleDateString("sk-SK", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "teraz";
  const m = Math.floor(s / 60);
  if (m < 60) return `pred ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `pred ${h} h`;
  return "dávnejšie";
}

export default function Dashboard() {
  const store = useStore();
  const [showLegend, setShowLegend] = useState(false);
  const [showFormInfo, setShowFormInfo] = useState(false);
  const [showLoadInfo, setShowLoadInfo] = useState(false);

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
      <div className="flex flex-col gap-5 pt-4 pb-32 animate-pulse">
        <div className="flex justify-between items-end">
          <div className="space-y-2">
            <div className="h-3 w-28 bg-white/10 rounded" />
            <div className="h-8 w-44 bg-white/10 rounded" />
          </div>
          <div className="h-7 w-16 bg-white/10 rounded-full" />
        </div>
        <div className="h-16 bg-white/5 rounded-2xl" />
        <div className="h-28 bg-white/5 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-white/5 rounded-2xl" />
          ))}
        </div>
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

  // Tréningová záťaž (acute:chronic ratio) — kľúčový Hanson ukazovateľ preťaženia
  const tl = d.training_load || {};
  const acuteLoad: number | null = tl.acute_load ?? null;
  const chronicLoad: number | null = tl.chronic_load ?? null;
  let acRatio: number | null = tl.ratio ?? null;
  if (acRatio == null && acuteLoad && chronicLoad) {
    acRatio = Math.round((acuteLoad / chronicLoad) * 100) / 100;
  }
  const loadStatus = getLoadStatus(acRatio);

  // Adaptivita: navrhni úpravu tréningu pri slabej forme alebo vysokej A:C záťaži
  const needsAdjustment =
    formStatus?.label === "Potrebuješ odpočinok" || (acRatio != null && acRatio > 1.4);

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

      {data && store.dashboardLoadedAt && (
        <p className="text-[11px] text-gray-500 -mt-3">
          Naposledy synchronizované {timeAgo(store.dashboardLoadedAt)}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm font-bold break-words">
          ⚠️ {error}
          <p className="text-xs font-normal mt-1 text-rose-400/80">
            Aby appka fungovala, prepoj svoj Garmin účet v Nastaveniach (alebo stlač Refresh).
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-primary underline underline-offset-2"
          >
            Prejsť do Nastavení a prepojiť Garmin <ChevronRight size={14} />
          </Link>
        </div>
      )}

      {/* Stav formy */}
      {formStatus && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`${formStatus.bg} border rounded-2xl px-4 py-3`}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{formStatus.dot}</span>
            <div>
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Stav formy</p>
              <p className={`font-bold ${formStatus.color}`}>{formStatus.label}</p>
            </div>
            <button
              onClick={() => setShowFormInfo((v) => !v)}
              className="ml-auto text-gray-400 hover:text-white p-1"
              aria-label="Čo je stav formy?"
            >
              <Info size={16} />
            </button>
          </div>
          {showFormInfo && (
            <p className="text-xs text-gray-300 leading-relaxed mt-2 pt-2 border-t border-white/10">
              Súhrn z tvojho spánku, Body Battery a pripravenosti. 🟢 si oddýchnutý a môžeš
              naplno; 🟡 v pohode, ale nepreháňaj; 🔴 zvoľ ľahší tréning alebo oddych. Mierna
              únava počas prípravy je normálna (kumulovaná únava) — pozor len na prudký prepad.
            </p>
          )}
        </motion.div>
      )}

      {/* Tréningová záťaž (acute:chronic ratio) */}
      {loadStatus && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`${loadStatus.bg} border rounded-2xl px-4 py-3`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{loadStatus.dot}</span>
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                  Tréningová záťaž (A:C)
                  <button
                    onClick={() => setShowLoadInfo((v) => !v)}
                    className="text-gray-400 hover:text-white"
                    aria-label="Čo je A:C záťaž?"
                  >
                    <Info size={14} />
                  </button>
                </p>
                <p className={`font-bold ${loadStatus.color}`}>{loadStatus.label}</p>
              </div>
            </div>
            {acRatio != null && (
              <div className="text-right shrink-0">
                <p className={`text-2xl font-bold ${loadStatus.color}`}>{acRatio.toFixed(2)}</p>
                {acuteLoad != null && chronicLoad != null && (
                  <p className="text-[10px] text-gray-500">
                    akút {Math.round(acuteLoad)} / chron {Math.round(chronicLoad)}
                  </p>
                )}
              </div>
            )}
          </div>
          {showLoadInfo && (
            <p className="text-xs text-gray-300 leading-relaxed mt-2 pt-2 border-t border-white/10">
              Pomer <b className="text-gray-100">akútnej</b> (~7 dní) a <b className="text-gray-100">chronickej</b>
              {" "}(~28 dní) záťaže. <b className="text-gray-100">0,8–1,4</b> = bezpečné pásmo;
              {" "}<b className="text-gray-100">nad 1,4</b> = priveľa priskoro, uber; <b className="text-gray-100">pod 0,8</b>
              {" "}= priestor pridať. Pomáha rásť bez zranenia.
            </p>
          )}
        </motion.div>
      )}

      {/* Adaptívna korekcia — pri slabej forme alebo vysokej záťaži */}
      {data && needsAdjustment && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4"
        >
          <div className="flex gap-3">
            <div className="mt-0.5 bg-amber-500/20 p-2 rounded-xl text-amber-300 flex-shrink-0 h-min">
              <Activity size={20} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wider mb-1">
                Odporúčam upraviť tréning
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                {acRatio != null && acRatio > 1.4
                  ? "Tvoja tréningová záťaž je vysoká"
                  : "Dnešná forma je nižšia"}
                {" "}— najbližší tréning by bolo dobré zmäkčiť. Tréner ti ho prepočíta podľa
                pripravenosti, HRV a záťaže.
              </p>
              <Link
                href="/plan"
                className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-amber-300 underline underline-offset-2"
              >
                Prepočítať najbližší tréning <ChevronRight size={14} />
              </Link>
            </div>
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
            <p className="text-gray-400 text-sm mb-2 max-w-[80%]">
              {todayWorkout.description || "Pozri detail v sekcii Plán."}
            </p>
            {(() => {
              const c = classifyWorkout(todayWorkout.title || "");
              return c.why ? (
                <p className="text-xs text-gray-500 italic mb-4 max-w-[85%] leading-snug">💡 {c.why}</p>
              ) : null;
            })()}
            <Link href="/plan">
              <span className="inline-flex items-center gap-1 text-primary text-sm font-bold">
                Zobraziť detail <ChevronRight size={16} />
              </span>
            </Link>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-1 text-gray-300">Dnes oddychový deň</h2>
            <p className="text-gray-500 text-sm mb-4 max-w-[85%] leading-snug">
              Voľno a ľahká regenerácia sú súčasťou Hansonovej metódy — telo silnie počas oddychu.
              (Ak si dnes čakal tréning, over prepojenie Garminu alebo ho nájdeš v sekcii Plán.)
            </p>
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
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Activity size={20} className="text-gray-400" /> Ranný Report
          </h3>
          <button
            onClick={() => setShowLegend((v) => !v)}
            className="text-gray-400 hover:text-white p-1.5 -mr-1.5"
            aria-label="Čo znamenajú tieto metriky?"
          >
            <Info size={18} />
          </button>
        </div>

        {showLegend && (
          <div className="glass-card p-4 mb-3 text-xs text-gray-300 flex flex-col gap-2 leading-relaxed">
            <p><b className="text-indigo-300">Spánok</b> — dĺžka a kvalita spánku za noc (skóre 0–100). Lepší spánok = lepšia regenerácia.</p>
            <p><b className="text-rose-300">HRV</b> — variabilita srdcového tepu, ukazovateľ regenerácie a stresu. „BALANCED"/vyššie = oddýchnuté telo.</p>
            <p><b className="text-emerald-300">Body Battery</b> — odhad zásob energie tela (0–100). Ráno vysoké = si nabitý, nízke = treba oddych.</p>
            <p><b className="text-amber-300">Pokojový tep</b> — tep v pokoji (bpm). Nižší býva znakom lepšej kondície.</p>
            <p><b className="text-sky-300">Pripravenosť</b> — ako je telo pripravené na záťaž (0–100). Nízke = zvoľ ľahší tréning.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {/* Spánok */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 }}
            className="glass-card p-4"
            title="Dĺžka a kvalita spánku za poslednú noc (skóre 0–100 z Garminu). Dobrý spánok = lepšia regenerácia."
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
            title="HRV (variabilita srdcového tepu) — ukazovateľ regenerácie a stresu. Vyššie/stabilné = telo je oddýchnuté."
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
            title="Body Battery (0–100) — odhad zásob energie tela. Vysoké ráno = si nabitý, nízke = potrebuješ oddych."
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
            title="Pokojový tep (bpm) — počet úderov srdca v pokoji. Nižší býva znakom lepšej kondície."
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
          title="Pripravenosť na tréning (0–100) — Garmin odhad, ako je telo pripravené na záťaž (spánok, HRV, únava). Nízke = zvoľ ľahší tréning."
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
