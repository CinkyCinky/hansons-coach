"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine
} from "recharts";
import { Activity, Moon, Battery, Heart, TrendingUp, Loader2, RefreshCcw, Info } from "lucide-react";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { hrvStatusSk } from "@/lib/garminLabels";

function formatPace(sec: number | null): string {
  if (!sec) return "--";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function shortDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

// Čitateľný dátum pre zoznam behov (napr. "15. januára")
function longDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  return d.toLocaleDateString("sk-SK", { day: "numeric", month: "long" });
}

function VolumeRing({ pct, value, sub }: { pct: number; value: string; sub: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  const off = c * (1 - clamped);
  return (
    <div className="flex items-center gap-4">
      <svg width="96" height="96" viewBox="0 0 100 100" className="shrink-0">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke="#f97316" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 50 50)"
        />
        <text x="50" y="55" textAnchor="middle" fill="#ffffff" fontSize="22" fontWeight="700">
          {Math.round(clamped * 100)}%
        </text>
      </svg>
      <div>
        <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Tento týždeň</p>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-gray-500 mt-1 max-w-[180px]">{sub}</p>
      </div>
    </div>
  );
}

function getLoadStatus(ratio?: number | null) {
  if (ratio == null) return null;
  if (ratio > 1.5) return { label: "Vysoké riziko preťaženia", color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20", dot: "🔴" };
  if (ratio > 1.4) return { label: "Zvýšená záťaž — opatrne", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", dot: "🟠" };
  if (ratio >= 0.8) return { label: "Optimálna záťaž", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "🟢" };
  return { label: "Podtrénovanie — priestor pridať", color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20", dot: "🔵" };
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

function TrendChart({ data, color, label, refLine }: { data: any[]; color: string; label: string; refLine?: number }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="day" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
            <Tooltip {...CHART_STYLE} />
            {refLine != null && <ReferenceLine y={refLine} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} />}
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Reports() {
  const store = useStore();
  const [tab, setTab] = useState<"weekly" | "runs">("weekly");
  const [showLegend, setShowLegend] = useState(false);

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

  // EF trend (efektivita = rýchlosť na rovine / tep) — rast v čase = stúpajúca kondícia
  const efTrendData = (data?.ef_trend ?? []).map((e: any) => ({
    day: shortDate(e.date),
    ef: e.ef,
    name: e.name,
  }));
  const efChange =
    efTrendData.length >= 2
      ? Math.round(((efTrendData[efTrendData.length - 1].ef - efTrendData[0].ef) / efTrendData[0].ef) * 1000) / 10
      : null;

  // Týždenný objem (km/týždeň) — kľúčová Hanson metrika
  const volumeData = (data?.weekly_volume ?? []) as { week: string; km: number }[];
  const goalPace: number | null = data?.goal_pace_sec ?? null;

  // Tréningová záťaž (acute:chronic ratio)
  const tl = data?.training_load || {};
  let acRatio: number | null = tl.ratio ?? null;
  if (acRatio == null && tl.acute_load && tl.chronic_load) {
    acRatio = Math.round((tl.acute_load / tl.chronic_load) * 100) / 100;
  }
  const loadStatus = getLoadStatus(acRatio);

  // Týždenný objem: tento týždeň vs najsilnejší týždeň cyklu (čestný cieľ bez vymyslených čísel)
  const thisWeekKm = volumeData.length ? volumeData[volumeData.length - 1].km : 0;
  const lastWeekKm = volumeData.length > 1 ? volumeData[volumeData.length - 2].km : 0;
  const peakKm = volumeData.reduce((m, w) => Math.max(m, w.km), 0);
  const volPct = peakKm > 0 ? thisWeekKm / peakKm : 0;
  const volDelta = lastWeekKm > 0 ? Math.round(((thisWeekKm - lastWeekKm) / lastWeekKm) * 100) : null;

  // Trendy formy (vo2max / pokojový tep / A:C ratio) — pribúdajú denne
  const trends = (data?.metric_trends ?? []) as any[];
  const vo2Data = trends.filter((t) => t.vo2max != null).map((t) => ({ day: shortDate(t.date), v: t.vo2max }));
  const rhrData = trends.filter((t) => t.resting_hr != null).map((t) => ({ day: shortDate(t.date), v: t.resting_hr }));
  const acData = trends.filter((t) => t.ac_ratio != null).map((t) => ({ day: shortDate(t.date), v: t.ac_ratio }));
  const hrvTrend = trends.filter((t) => t.hrv != null).map((t) => ({ day: shortDate(t.date), v: t.hrv }));
  const hasTrends = vo2Data.length >= 3 || rhrData.length >= 3 || acData.length >= 3;

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
    <div className="flex flex-col gap-5 pt-4 pb-32">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-1">Reporty</h1>
          <p className="text-gray-400 text-sm">Posledných 7 dní</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLegend((v) => !v)}
            className="bg-gray-800 p-2 rounded-full text-gray-400 hover:text-white transition-colors"
            aria-label="Čo znamenajú tieto údaje?"
          >
            <Info size={16} />
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="bg-gray-800 p-2 rounded-full text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {showLegend && (
        <div className="glass-card p-4 text-xs text-gray-300 flex flex-col gap-2 leading-relaxed">
          <p><b className="text-amber-300">Týždenný objem</b> — koľko km nabeháš za týždeň. Pri Hansonovi je postupný nárast objemu najdôležitejší (princíp kumulovanej únavy).</p>
          <p><b className="text-primary">Tempo trend</b> — priemerné tempo behov (min/km, nižšie = rýchlejšie). Zelená prerušovaná čiara je tvoje cieľové polmaratónske tempo.</p>
          <p><b className="text-emerald-300">Kadencia</b> — počet krokov za minútu (spm).</p>
          <p><b className="text-indigo-300">Spánok</b> — priemerná dĺžka spánku za noc.</p>
          <p><b className="text-rose-300">HRV</b> — variabilita srdcového tepu (ms), ukazovateľ regenerácie. „Priem. noc" je priemer za poslednú noc, „Týž. priemer" za 7 dní. Vyššie a stabilné hodnoty = oddýchnuté telo.</p>
          <p><b className="text-emerald-300">Body Battery</b> — odhad zásob energie tela (0–100). Dôležité na zvládanie únavy počas tvrdého bloku.</p>
        </div>
      )}

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

          {/* Tréningová záťaž (acute:chronic) */}
          {loadStatus && (
            <div
              className={`${loadStatus.bg} border rounded-2xl px-4 py-3 flex items-center justify-between gap-3`}
              title="Pomer akútnej a chronickej tréningovej záťaže (Garmin). Nad 1.4 = riziko preťaženia, pod 0.8 = priestor pridať objem."
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{loadStatus.dot}</span>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Tréningová záťaž (A:C)</p>
                  <p className={`font-bold ${loadStatus.color}`}>{loadStatus.label}</p>
                </div>
              </div>
              {acRatio != null && (
                <div className="text-right shrink-0">
                  <p className={`text-2xl font-bold ${loadStatus.color}`}>{acRatio.toFixed(2)}</p>
                  {tl.acute_load != null && tl.chronic_load != null && (
                    <p className="text-[10px] text-gray-500">
                      akút {Math.round(tl.acute_load)} / chron {Math.round(tl.chronic_load)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

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
                <Heart size={12} /> HRV týž. priemer
              </p>
              <h3 className="text-2xl font-bold">
                {data.hrv?.weekly_avg ? `${data.hrv.weekly_avg} ms` : "--"}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {data.hrv?.status ? hrvStatusSk(data.hrv.status) : ""}
              </p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                <Battery size={12} /> Body Battery <span className="text-gray-500">pri zobudení</span>
              </p>
              <h3 className="text-2xl font-bold">
                {data.body_battery?.today ?? "--"}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {data.body_battery?.now != null ? `teraz ${data.body_battery.now}` : `priem. ${data.body_battery?.weekly_avg ?? "--"}`}
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
                  <p className="text-xs text-gray-500 mb-1">Priem. noc</p>
                  <p className="text-xl font-bold text-rose-400">{data.hrv.last_night != null ? `${data.hrv.last_night} ms` : "--"}</p>
                  {data.hrv.last_5min_high != null && (
                    <p className="text-[10px] text-gray-600 mt-1">5-min max: {data.hrv.last_5min_high} ms</p>
                  )}
                </div>
                <div className="flex-1 bg-black/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Týž. priemer</p>
                  <p className="text-xl font-bold text-rose-300">{data.hrv.weekly_avg != null ? `${data.hrv.weekly_avg} ms` : "--"}</p>
                </div>
                <div className="flex-1 bg-black/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Stav</p>
                  <p className="text-sm font-bold text-gray-200">{hrvStatusSk(data.hrv.status)}</p>
                </div>
              </div>

              {/* Trend HRV za noc — pribúda denne (čiara = týždňový priemer ako referencia) */}
              {hrvTrend.length >= 3 ? (
                <div className="mt-4">
                  <TrendChart
                    data={hrvTrend}
                    color="#fb7185"
                    label={`HRV za noc (ms) — posledných ${hrvTrend.length} dní, vyššie/stabilné = lepšie`}
                    refLine={data.hrv.weekly_avg ?? undefined}
                  />
                </div>
              ) : (
                <p className="text-[11px] text-gray-600 mt-3 leading-snug">
                  Graf trendu HRV sa zobrazí po pár dňoch — hodnoty pribúdajú každú noc.
                </p>
              )}
            </div>
          )}

          {/* Trendy formy (pribúdajú denne) */}
          {hasTrends && (
            <div className="glass-card p-4">
              <h3 className="text-base font-bold mb-1 flex items-center gap-2">
                <TrendingUp className="text-primary" size={18} /> Trendy formy
              </h3>
              <p className="text-xs text-gray-500 mb-4">Vývoj kľúčových ukazovateľov v čase.</p>
              {vo2Data.length >= 3 && <TrendChart data={vo2Data} color="#3b82f6" label="VO2max (vyššie = lepšie)" />}
              {rhrData.length >= 3 && <TrendChart data={rhrData} color="#f59e0b" label="Pokojový tep (nižšie = lepšie)" />}
              {acData.length >= 3 && <TrendChart data={acData} color="#34d399" label="A:C záťaž (cieľ 0.8–1.4)" refLine={1.4} />}
            </div>
          )}
        </motion.div>
      )}

      {/* ── TAB: Behy ── */}
      {tab === "runs" && data && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">

          {/* Kruh: týždenný objem ako % najsilnejšieho týždňa */}
          {volumeData.length > 0 && peakKm > 0 && (
            <div className="glass-card p-4">
              <VolumeRing
                pct={volPct}
                value={`${thisWeekKm} km`}
                sub={`${Math.round(volPct * 100)}% tvojho najsilnejšieho týždňa (${peakKm} km)${
                  volDelta != null ? ` • ${volDelta >= 0 ? "+" : ""}${volDelta}% vs minulý` : ""
                }`}
              />
            </div>
          )}

          {/* Graf: Týždenný objem (km/týždeň) — hlavná Hanson metrika */}
          {volumeData.length > 0 && (
            <div className="glass-card p-4">
              <h3 className="text-base font-bold mb-1 flex items-center gap-2">
                <Activity className="text-amber-400" size={18} /> Týždenný objem (km)
              </h3>
              <p className="text-xs text-gray-500 mb-4">Postupný nárast objemu je jadro Hansonovej metódy.</p>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="week" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      {...CHART_STYLE}
                      cursor={{ fill: "rgba(255,255,255,0.06)" }}
                      formatter={(v: any) => [`${v} km`, "Týždeň"]}
                    />
                    <Bar dataKey="km" name="km" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Graf: tempo trend (s referenciou cieľového tempa) */}
          {runsChartData.length >= 3 && (
            <div className="glass-card p-4">
              <h3 className="text-base font-bold mb-1 flex items-center gap-2">
                <TrendingUp className="text-primary" size={18} /> Tempo trend
              </h3>
              {goalPace && (
                <p className="text-xs text-gray-500 mb-4">
                  Prerušovaná čiara = cieľové tempo {formatPace(goalPace)}/km
                </p>
              )}
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
                    {goalPace && (
                      <ReferenceLine y={goalPace} stroke="#34d399" strokeDasharray="4 4" strokeWidth={1.5} />
                    )}
                    <Line type="monotone" dataKey="tempo" name="Tempo" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Graf: EF trend (efektivita behu = kondícia v čase) */}
          {efTrendData.length >= 3 && (
            <div className="glass-card p-4">
              <h3 className="text-base font-bold mb-1 flex items-center gap-2">
                <TrendingUp className="text-indigo-400" size={18} /> Efektivita (EF) — trend kondície
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Rýchlosť na rovine / tep. Vyššie = ekonomickejší beh.{" "}
                {efChange != null && (
                  <span className={efChange >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {efChange >= 0 ? "▲" : "▼"} {Math.abs(efChange)} % za obdobie
                  </span>
                )}
                . Najvýpovednejšie pri Easy behoch.
              </p>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={efTrendData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="day" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} domain={["dataMin - 0.05", "dataMax + 0.05"]} tickFormatter={(v) => Number(v).toFixed(2)} />
                    <Tooltip {...CHART_STYLE} formatter={(v: any) => [Number(v).toFixed(3), "EF"]} />
                    <Line type="monotone" dataKey="ef" name="EF" stroke="#818cf8" strokeWidth={2.5} dot={{ r: 3, fill: "#818cf8" }} connectNulls />
                  </LineChart>
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
                      <p className="text-xs text-gray-500">{longDate(run.date)}</p>
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
                      <p className="text-xs text-gray-500">Priem. tep</p>
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
