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
import { classifyWorkout } from "@/lib/workoutType";

// Backend väčšinu chýb hlási už po slovensky a zrozumiteľne („Neplatný token. Prosím
// prihláste sa znova.", „Profil nenájdený") — takú hlášku NEZAHADZUJEME, len k nej
// doplníme konkrétny ďalší krok. Vlastné znenie skladáme iba pre chyby, ktoré žiadny
// zmysluplný detail nemajú (sieť, timeout, holý anglický statusText z prehliadača).
function isSlovakDetail(msg: string): boolean {
  if (msg.length < 6) return false;
  // Slovenská diakritika alebo typicky slovenské slovo = hláška prišla z nášho backendu.
  if (/[áäčďéíĺľňóôŕšťúýž]/i.test(msg)) return true;
  // Poistka pre hlášky bez diakritiky — len slová, ktoré v angličtine nedávajú zmysel,
  // aby sa surová anglická chyba omylom nezobrazila zverencovi tak, ako prišla.
  return /\b(sa|nie|prosim|chyba|profil|nepodarilo|neplatny|zlyhalo)\b/i.test(msg);
}

// Ďalší krok, ktorý k slovenskej hláške dopĺňame — podľa toho, čoho sa chyba týka.
// Poradie je dôležité: vypršané prihlásenie sa kontroluje PRED Garminom, lebo backend
// posiela „Garmin prihlásenie zlyhalo: …" aj so stavom 401.
function nextStepSk(t: string): string {
  if (
    t.includes("token") ||
    t.includes("prihláste sa") ||
    t.includes("unauthorized") ||
    t.includes("not authenticated") ||
    t.includes("401")
  ) {
    return "Odhlás sa v Nastaveniach a prihlás sa znova — potom sa report načíta.";
  }
  if (t.includes("garmin")) {
    return "Skontroluj v Nastaveniach, či je účet Garmin pripojený, a prihlásenie prípadne obnov.";
  }
  if (t.includes("profil")) {
    return "Otvor Nastavenia a ulož svoj profil (cieľový čas, dátum pretekov) — potom skús report znova.";
  }
  return "Skús to znova cez ikonu obnovenia hore vpravo.";
}

function reportErrorSk(raw: string | null, status: number | null = null): string {
  const msg = (raw || "").trim();
  const t = msg.toLowerCase();

  // Vypršané prihlásenie poznáme z HTTP stavu — spoľahlivo, bez hádania z textu.
  // (Backendová hláška o zlyhaní Garminu môže obsahovať „401" v úplne inom význame.)
  if (status === 401 || status === 403) {
    return "Prihlásenie vypršalo. Odhlás sa v Nastaveniach a prihlás sa znova — potom sa report načíta.";
  }

  // ── Sieť: požiadavka vôbec neodišla, server nič nepovedal → znenie skladáme sami ──
  if (
    t.includes("failed to fetch") ||
    t.includes("fetch failed") ||
    t.includes("networkerror") ||
    t.includes("network request failed") ||
    t.includes("load failed")
  ) {
    return "Nepodarilo sa spojiť so serverom. Skontroluj internet a ťukni na obnovenie (ikona šípok hore vpravo). Ak si na firemnej sieti alebo máš zapnutú VPN či blokovač, skús ich vypnúť.";
  }

  // ── Timeout / brána: prehliadač dostal len anglický statusText bez detailu ──
  if (
    t.includes("timeout") ||
    t.includes("timed out") ||
    t.includes("504") ||
    t.includes("gateway")
  ) {
    return "Server odpovedal príliš pomaly — Garmin niekedy potrebuje chvíľu. Skús to o minútu znova cez ikonu obnovenia hore vpravo.";
  }

  // ── Zrozumiteľná slovenská hláška z backendu: ponecháme ju a doplníme ďalší krok ──
  if (isSlovakDetail(msg)) {
    const dot = /[.!?]$/.test(msg) ? "" : ".";
    const step = nextStepSk(t);
    // Ak hláška z backendu už sama hovorí, že sa má zverenec prihlásiť znova, druhý raz
    // to nepridávame — inak vznikne „…prihláste sa znova. Odhlás sa a prihlás sa znova.“
    if (t.includes("prihlás") || t.includes("prihláste")) return `${msg}${dot}`;
    return `${msg}${dot} ${step}`;
  }

  // ── Anglické hlášky: vypršané prihlásenie musí byť PRED kontrolou „garmin" ──
  if (
    t.includes("unauthorized") ||
    t.includes("not authenticated") ||
    t.includes("401") ||
    t.includes("forbidden") ||
    t.includes("403")
  ) {
    return "Prihlásenie vypršalo. Odhlás sa v Nastaveniach a prihlás sa znova — potom sa report načíta.";
  }

  if (t.includes("garmin")) {
    return "Nepodarilo sa načítať dáta z Garmin Connect. Skontroluj v Nastaveniach, či je účet Garmin pripojený, a prihlásenie prípadne obnov.";
  }

  return "Report sa nepodarilo načítať. Skús to znova cez ikonu obnovenia hore vpravo; ak to potrvá, skontroluj pripojenie účtu Garmin v Nastaveniach.";
}

// V slovenčine sa desatinné miesta oddeľujú čiarkou. Čísla z backendu prídu s bodkou
// (43.3), texty v UI píšu „0,8–1,4" — bez tohto by sa v jednom reporte miešali oba zápisy.
// `digits` = pevný počet desatinných miest, inak sa zobrazí toľko, koľko číslo má.
function num(v: number | string | null | undefined, digits?: number): string {
  if (v == null || v === "") return "--";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "--";
  return (digits != null ? n.toFixed(digits) : String(n)).replace(".", ",");
}

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

// `hint` = čo s tým konkrétne robiť; zobrazuje sa v rozbaliteľnom vysvetlení pri karte,
// aby samotný štítok ostal krátky a nezalamoval sa na mobile.
function getLoadStatus(ratio?: number | null) {
  if (ratio == null) return null;
  if (ratio > 1.5) return {
    label: "Vysoké riziko preťaženia",
    hint: "Za posledný týždeň si nabehal oveľa viac, než na čo je telo zvyknuté. Zaraď pár ľahkých dní a najbližší tvrdý tréning radšej zmäkči.",
    color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20", dot: "🔴",
  };
  if (ratio > 1.4) return {
    label: "Zvýšená záťaž — opatrne",
    hint: "Objem rastie rýchlejšie, ako je zdravé. Ďalší týždeň už nepridávaj a sleduj, či sa neobjavuje bolesť či dlhodobá únava.",
    color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", dot: "🟠",
  };
  if (ratio >= 0.8) return {
    label: "Optimálna záťaž",
    hint: "Záťaž rastie tempom, ktoré telo stíha vstrebať. Pokračuj podľa plánu.",
    color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "🟢",
  };
  // Nízky pomer NIE JE automaticky chyba: v regeneračnom týždni aj v tapere (zámerné
  // znižovanie objemu pred pretekmi) je to presne to, čo má plán robiť — preto tvrdenie
  // „podtrénovanie" nahradil opis stavu a podmienené odporúčanie.
  return {
    label: "Nižšia záťaž ako zvyčajne",
    hint: "Posledný týždeň bol ľahší, než na čo si zvyknutý. Ak je to zámer — regeneračný týždeň alebo tapering (zámerné znižovanie objemu pred pretekmi) — je všetko v poriadku a nič nemeň. Ak nie, máš priestor postupne pridať objem.",
    color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20", dot: "🔵",
  };
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
            <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={(v) => num(v)} />
            <Tooltip {...CHART_STYLE} formatter={(v: any, n: any) => [num(v), n]} />
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
  // Vysvetlenie A:C musí byť rozbaliteľné — HTML `title` sa na dotykovom displeji nikdy nezobrazí.
  const [showLoadInfo, setShowLoadInfo] = useState(false);

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

  // Denný rad z Garminu nesie len `charged` = koľko bodov batérie sa cez noc NABILO
  // (prírastok), nie stav pri zobudení — ten je len pre dnešok (`body_battery.today`).
  // Preto graf hovorí o nabití a nesľubuje stav; inak by dlaždica a graf ukazovali
  // dve rôzne čísla pod rovnakým názvom.
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
          <p><b className="text-indigo-300">Spánok</b> — priemerná dĺžka spánku za noc + podiel hlbokého a REM spánku (regeneračné fázy; hlboký ~13–23 %, REM ~20–25 % býva zdravé).</p>
          <p><b className="text-rose-300">HRV</b> — variabilita srdcového tepu (ms), ukazovateľ regenerácie. „Priem. noc" je priemer za poslednú noc, „Týž. priemer" za 7 dní. Vyššie a stabilné hodnoty = oddýchnuté telo.</p>
          <p><b className="text-emerald-300">Body Battery</b> — odhad zásob energie tela (0–100). Dlaždica ukazuje <b>stav pri zobudení</b>, graf <b>nočné nabitie</b> (o koľko bodov batéria cez noc stúpla) — sú to dve rôzne čísla.</p>
          <p><b className="text-emerald-300">A:C záťaž</b> — pomer akútnej (posledných ~7 dní) a chronickej (posledných ~28 dní) tréningovej záťaže. Hovorí, či pridávaš rýchlejšie, než na čo je telo zvyknuté. <b>0,8–1,4</b> je bezpečné pásmo, nad 1,4 rastie riziko zranenia, pod 0,8 je záťaž nižšia ako zvyčajne (v tapere pred pretekmi je to zámer).</p>
          <p><b className="text-primary">VO2max</b> — maximálna spotreba kyslíka (ml/kg/min), Garminov odhad aeróbnej kondície. Vyššie = lepšie; mení sa pomaly, sleduj trend za týždne, nie deň po dni.</p>
          <p><b className="text-amber-300">Pokojový tep</b> — tep v úplnom pokoji (bpm, meraný najmä v spánku). Nižší býva znakom lepšej kondície; náhly skok o niekoľko úderov signalizuje únavu alebo blížiacu sa chorobu.</p>
          <p><b className="text-indigo-300">EF (efektivita behu)</b> — koľko rýchlosti „vyťažíš" z jedného úderu srdca (rýchlosť prepočítaná na rovinu / tep). Vyššie = ekonomickejší beh. Najvýpovednejšie pri Easy behoch (pomalé regeneračné behy), kde je intenzita porovnateľná.</p>
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
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-xl text-sm leading-relaxed">
          ⚠️ {reportErrorSk(error, store.reportErrorStatus)}
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
            <div className={`${loadStatus.bg} border rounded-2xl px-4 py-3`}>
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
                    <p className={`text-2xl font-bold ${loadStatus.color}`}>{num(acRatio, 2)}</p>
                    {tl.acute_load != null && tl.chronic_load != null && (
                      <p className="text-[10px] text-gray-500">
                        akút {Math.round(tl.acute_load)} / chron {Math.round(tl.chronic_load)}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {showLoadInfo && (
                <div className="text-xs text-gray-300 leading-relaxed mt-2 pt-2 border-t border-white/10 flex flex-col gap-2">
                  <p>
                    Pomer <b className="text-gray-100">akútnej</b> (posledných ~7 dní) a
                    {" "}<b className="text-gray-100">chronickej</b> (posledných ~28 dní) tréningovej záťaže —
                    {" "}teda či pridávaš rýchlejšie, než na čo je telo zvyknuté.
                    {" "}<b className="text-gray-100">0,8–1,4</b> = bezpečné pásmo;
                    {" "}<b className="text-gray-100">nad 1,4</b> = priveľa priskoro (riziko zranenia);
                    {" "}<b className="text-gray-100">pod 0,8</b> = nižšia záťaž ako zvyčajne.
                  </p>
                  <p className="text-gray-400">{loadStatus.hint}</p>
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
              <h3 className="text-2xl font-bold">{num(data.total_km)} km</h3>
              <p className="text-xs text-gray-500 mt-1">{data.runs?.length ?? 0} behov</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                <Moon size={12} /> Priem. spánok
              </p>
              <h3 className="text-2xl font-bold">
                {data.avg_sleep_hours ? `${num(data.avg_sleep_hours)}h` : "--"}
              </h3>
              {(() => {
                const nights = (data?.sleep ?? []).filter((s: any) => s.deep_pct != null || s.rem_pct != null);
                if (!nights.length) return <p className="text-xs text-gray-500 mt-1">posledných 7 dní</p>;
                const avg = (k: string) => Math.round(nights.reduce((a: number, s: any) => a + (s[k] ?? 0), 0) / nights.length);
                return (
                  <p className="text-xs text-gray-500 mt-1">
                    hlboký <span className="text-indigo-300 font-bold">{avg("deep_pct")}%</span> · REM <span className="text-indigo-300 font-bold">{avg("rem_pct")}%</span>
                  </p>
                );
              })()}
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                <Heart size={12} /> HRV týž. priemer
              </p>
              <h3 className="text-2xl font-bold">
                {data.hrv?.weekly_avg ? `${num(data.hrv.weekly_avg)} ms` : "--"}
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
                {num(data.body_battery?.today)}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {/* Záložná hodnota je priemer nočného NABITIA, nie stavu — musí to byť v texte, inak vyzerá ako to isté číslo */}
                {data.body_battery?.now != null ? `teraz ${num(data.body_battery.now)}` : `priem. nabitie za noc ${num(data.body_battery?.weekly_avg)}`}
              </p>
            </div>
          </div>

          {/* Graf: Body Battery + Spánok */}
          {comboData.length > 0 && (
            <div className="glass-card p-4">
              <h3 className="text-base font-bold mb-1 flex items-center gap-2">
                <Battery className="text-emerald-400" size={18} /> Nočné nabitie batérie a spánok
              </h3>
              <p className="text-xs text-gray-500 mb-4 leading-snug">
                Zelená čiara je <b className="text-gray-300">nočné nabitie</b> — o koľko bodov (0–100)
                sa Body Battery (zásoby energie tela) cez noc doplnila. Nie je to stav pri zobudení,
                ten nájdeš v dlaždici vyššie. Vyššie nabitie a dlhší spánok = lepšia regenerácia.
              </p>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={comboData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="day" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="l" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <YAxis yAxisId="r" orientation="right" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} domain={[0, 12]} />
                    <Tooltip {...CHART_STYLE} formatter={(v: any, n: any) => [num(v), n]} />
                    <Line yAxisId="l" type="monotone" dataKey="bb" name="Nočné nabitie" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3, fill: "#34d399" }} connectNulls />
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
                  <p className="text-xl font-bold text-rose-400">{data.hrv.last_night != null ? `${num(data.hrv.last_night)} ms` : "--"}</p>
                  {data.hrv.last_5min_high != null && (
                    <p className="text-[10px] text-gray-600 mt-1">5-min max: {num(data.hrv.last_5min_high)} ms</p>
                  )}
                </div>
                <div className="flex-1 bg-black/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Týž. priemer</p>
                  <p className="text-xl font-bold text-rose-300">{data.hrv.weekly_avg != null ? `${num(data.hrv.weekly_avg)} ms` : "--"}</p>
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
              {acData.length >= 3 && <TrendChart data={acData} color="#34d399" label="A:C záťaž (bezpečné pásmo 0,8–1,4)" refLine={1.4} />}
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
                value={`${num(thisWeekKm)} km`}
                // Porovnanie je neúplné — bežiaci týždeň sa dorovnáva, preto „zatiaľ" a nie hotový verdikt
                sub={`${Math.round(volPct * 100)} % tvojho najsilnejšieho týždňa (${num(peakKm)} km)${
                  volDelta != null
                    ? ` • zatiaľ ${volDelta >= 0 ? "+" : ""}${volDelta} % oproti minulému týždňu (${num(lastWeekKm)} km) — tento týždeň ešte beží`
                    : ""
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
                      formatter={(v: any) => [`${num(v)} km`, "Týždeň"]}
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
                    {efChange >= 0 ? "▲" : "▼"} {num(Math.abs(efChange))} % za obdobie
                  </span>
                )}
                . Najvýpovednejšie pri Easy behoch.
              </p>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={efTrendData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="day" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} domain={["dataMin - 0.05", "dataMax + 0.05"]} tickFormatter={(v) => num(v, 2)} />
                    <Tooltip {...CHART_STYLE} formatter={(v: any) => [num(v, 3), "EF"]} />
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
              {(data.runs as any[]).map((run: any, i: number) => {
                // Typ behu z názvu tréningu — nový bežec inak nevie, načo daný beh v Hansonovi je.
                const c = classifyWorkout(run.name || "");
                return (
                <div key={i} className="glass-card p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm">{run.name || "Beh"}</p>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${c.badge}`}>
                          {c.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{longDate(run.date)}</p>
                    </div>
                    <span className="text-primary font-bold shrink-0">{num(run.distance_km)} km</span>
                  </div>
                  {c.why && (
                    <p className="text-[11px] text-gray-500 italic mb-2 leading-snug">💡 {c.why}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-black/20 rounded-lg p-2">
                      <p className="text-xs text-gray-500">Tempo</p>
                      <p className="font-bold text-primary font-mono text-sm">
                        {formatPace(run.avg_pace_sec)}/km
                      </p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-2">
                      <p className="text-xs text-gray-500">Priem. tep</p>
                      <p className="font-bold text-rose-400 text-sm">{num(run.avg_hr)} bpm</p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-2">
                      <p className="text-xs text-gray-500">Kadencia</p>
                      <p className="font-bold text-emerald-400 text-sm">{num(run.avg_cadence)} spm</p>
                    </div>
                  </div>
                </div>
                );
              })}
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
