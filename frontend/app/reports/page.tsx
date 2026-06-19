"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar
} from "recharts";
import { Activity, Moon, Battery, Heart, TrendingUp, Loader2, RefreshCcw } from "lucide-react";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";

function formatPace(sec: number | null): string {
  if (!sec) return "--";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function shortDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

const CHART_STYLE = {
  contentStyle: {
    backgroundColor: "#1a1a24",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    fontSize: "12px",
  },
  labelStyle: { display: "none" },
  itemStyle: { fontWeight: "bold" },
};

export default function Reports() {
  const store = useStore();
  const [tab, setTab] = useState<"weekly" | "runs">("weekly");

  useEffect(() => {
    store.loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    store.loadReport(true);
  };

  const { report: data, reportLoading: loading, reportError: error } = store;

  // Priprav dáta pre grafy
  const sleepChartData = data?.sleep?.slice(0, 7).reverse().map((s: any) => ({
    day: shortDate(s.date),
    spánok: s.duration_hours,
    skóre: s.score,
  })) ?? [];

  const bbChartData = data?.body_battery?.daily?.slice(-7).map((b: any) => ({
    day: shortDate(b.date),
    bb: b.charged,
  })) ?? [];

  const runsChartData = (data?.runs ?? []).slice(0, 7).reverse().map((r: any) => ({
    day: shortDate(r.date),
    km: r.distance_km,
    tempo: r.avg_pace_sec,
    hr: r.avg_hr,
    tempoStr: formatPace(r.avg_pace_sec),
  }));

  // Kombinovaný týždenný graf (spánok + BB) — zarovnané podľa dátumu, nie podľa indexu
  const bbByDay: Record<string, number> = {};
  bbChartData.forEach((b: any) => {
    if (b.day != null) bbByDay[b.day] = b.bb;
  });
  const comboData = sleepChartData.map((s: any) => ({
    day: s.day,
    spánok: s.spánok,
    bb: bbByDay[s.day] ?? null,
  }));

  return (
    <div className="flex flex-col gap-5 pt-4 pb-10">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-1">Reporty</h1>
          <p className="text-gray-400 text-sm">Posledných 7 dní</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="bg-gray-800 p-2 rounded-full text-gray-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      {/* Tabs */}
      <div className="bg-[#1a1a24] p-1 rounded-full flex relative">
        {(["weekly", "runs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-bold rounded-full z-10 transition-colors ${
              tab === t ? "text-white" : "text-gray-500"
            }`}
          >
            {t === "weekly" ? "Zdravie" : "Behy"}
          </button>
        ))}
        <motion.div
          className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-primary rounded-full z-0 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
          initial={false}
          animate={{ x: tab === "weekly" ? 4 : "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm font-bold">
          ⚠️ {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-primary" size={40} />
          <p className="text-gray-400 mt-4">Načítavam Garmin dáta...</p>
        </div>
      )}

      {/* ── TAB: Zdravie ── */}
      {tab === "weekly" && data && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card p-4">
              <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                <Activity size={12} /> Celkovo km
              </p>
              <h3 className="text-2xl font-bold">{data.total_km ?? "--"} km</h3>
              <p className="text-xs text-gray-500 mt-1">{data.runs?.length ?? 0} behov</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                <Moon size={12} /> Priem. spánok
              </p>
              <h3 className="text-2xl font-bold">
                {data.avg_sleep_hours ? `${data.avg_sleep_hours}h` : "--"}
              </h3>
              <p className="text-xs text-gray-500 mt-1">posledných 7 dní</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                <Heart size={12} /> HRV weekly avg
              </p>
              <h3 className="text-2xl font-bold">
                {data.hrv?.weekly_avg ? `${data.hrv.weekly_avg} ms` : "--"}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {data.hrv?.status ?? ""}
              </p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                <Battery size={12} /> Body Battery dnes
              </p>
              <h3 className="text-2xl font-bold">
                {data.body_battery?.today ?? "--"}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                avg {data.body_battery?.weekly_avg ?? "--"}
              </p>
            </div>
          </div>

          {/* Graf: Body Battery + Spánok */}
          {comboData.length > 0 && (
            <div className="glass-card p-4">
              <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                <Battery className="text-emerald-400" size={18} /> Body Battery & Spánok
              </h3>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={comboData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="day" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="l" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <YAxis yAxisId="r" orientation="right" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} domain={[0, 12]} />
                    <Tooltip {...CHART_STYLE} />
                    <Line yAxisId="l" type="monotone" dataKey="bb" name="Body Battery" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3, fill: "#34d399" }} connectNulls />
                    <Line yAxisId="r" type="monotone" dataKey="spánok" name="Spánok (h)" stroke="#818cf8" strokeWidth={2.5} dot={{ r: 3, fill: "#818cf8" }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Graf: HRV */}
          {data.hrv && (
            <div className="glass-card p-4">
              <h3 className="text-base font-bold mb-3 flex items-center gap-2">
                <Heart className="text-rose-400" size={18} /> HRV stav
              </h3>
              <div className="flex gap-4 mt-2">
                <div className="flex-1 bg-black/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Minulú noc</p>
                  <p className="text-xl font-bold text-rose-400">{data.hrv.last_night ?? "--"} ms</p>
                </div>
                <div className="flex-1 bg-black/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Weekly avg</p>
                  <p className="text-xl font-bold text-rose-300">{data.hrv.weekly_avg ?? "--"} ms</p>
                </div>
                <div className="flex-1 bg-black/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Stav</p>
                  <p className="text-sm font-bold text-gray-200">{data.hrv.status ?? "--"}</p>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ── TAB: Behy ── */}
      {tab === "runs" && data && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">

          {/* Graf: tempo trend */}
          {runsChartData.length > 0 && (
            <div className="glass-card p-4">
              <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                <TrendingUp className="text-primary" size={18} /> Tempo trend
              </h3>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={runsChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="day" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="rgba(255,255,255,0.4)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => formatPace(v)}
                      reversed
                    />
                    <Tooltip
                      {...CHART_STYLE}
                      formatter={(v: any) => [formatPace(v as number), "Tempo"]}
                    />
                    <Line type="monotone" dataKey="tempo" name="Tempo" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Graf: km per beh */}
          {runsChartData.length > 0 && (
            <div className="glass-card p-4">
              <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                <Activity className="text-amber-400" size={18} /> Objem behov (km)
              </h3>
              <div className="h-36 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={runsChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="day" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip {...CHART_STYLE} formatter={(v: any) => [`${v} km`, "Vzdialenosť"]} />
                    <Bar dataKey="km" name="km" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Zoznam behov */}
          {(data.runs ?? []).length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-base font-bold">Posledné behy</h3>
              {(data.runs as any[]).map((run: any, i: number) => (
                <div key={i} className="glass-card p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold text-sm">{run.name || "Beh"}</p>
                      <p className="text-xs text-gray-500">{run.date}</p>
                    </div>
                    <span className="text-primary font-bold">{run.distance_km} km</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-black/20 rounded-lg p-2">
                      <p className="text-xs text-gray-500">Tempo</p>
                      <p className="font-bold text-primary font-mono text-sm">
                        {formatPace(run.avg_pace_sec)}/km
                      </p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-2">
                      <p className="text-xs text-gray-500">Priem. HR</p>
                      <p className="font-bold text-rose-400 text-sm">{run.avg_hr ?? "--"} bpm</p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-2">
                      <p className="text-xs text-gray-500">Kadencia</p>
                      <p className="font-bold text-emerald-400 text-sm">{run.avg_cadence ?? "--"} spm</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(data.runs ?? []).length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Activity size={40} className="text-primary/30 mb-3" />
              <p className="text-gray-400">Za posledných 7 dní neboli zaznamenané žiadne behy.</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
