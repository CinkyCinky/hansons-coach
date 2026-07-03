"use client";

import { useEffect, useState } from "react";
import {
  Moon, Heart, Battery, Activity, Flame, ChevronRight,
  Loader2, Bot, RefreshCcw, Zap, TrendingUp, Info,
  CheckCircle2, Circle, ListChecks, Trophy, Apple, Hand
} from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { classifyWorkout } from "@/lib/workoutType";
import { hrvStatusSk, readinessLevelSk } from "@/lib/garminLabels";
import { fetchProfile, FEELING_KEY } from "@/lib/api";

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

// Slovenské skloňovanie pre odpočítavanie
const dayWord = (n: number) => (n === 1 ? "deň" : n >= 2 && n <= 4 ? "dni" : "dní");
const weekWord = (n: number) => (n === 1 ? "týždeň" : n >= 2 && n <= 4 ? "týždne" : "týždňov");

// Odpočítavanie do dňa pretekov (z profilu) — dni + približné týždne
function raceCountdown(raceDate?: string | null) {
  if (!raceDate) return null;
  const DAY = 1000 * 60 * 60 * 24;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const race = new Date(raceDate + "T00:00:00");
  if (isNaN(race.getTime())) return null;
  race.setHours(0, 0, 0, 0);
  const days = Math.round((race.getTime() - today.getTime()) / DAY);
  if (days < 0) return null;
  return {
    days,
    weeks: Math.floor(days / 7),
    rem: days % 7,
    dateLabel: race.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" }),
  };
}

// Pretekové tempo + medzičasy z cieľového času (na pretekový týždeň)
function goalSplits(t?: string | null) {
  if (!t) return null;
  const parts = String(t).split(":").map(Number);
  let sec = 0;
  if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) sec = parts[0] * 60 + parts[1];
  if (!sec || parts.some(isNaN)) return null;
  const paceSec = sec / 21.0975;
  const fmtPace = (p: number) => `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, "0")}`;
  const fmtT = (x: number) => {
    const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), ss = Math.round(x % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
  };
  return {
    pace: fmtPace(paceSec),
    splits: [5, 10, 15, 21.0975].map((d) => ({ label: d === 21.0975 ? "Cieľ" : `${d} km`, t: fmtT(paceSec * d) })),
  };
}

export default function Dashboard() {
  const store = useStore();
  const [showLegend, setShowLegend] = useState(false);
  const [showFormInfo, setShowFormInfo] = useState(false);
  const [showLoadInfo, setShowLoadInfo] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [feeling, setFeeling] = useState<{ feeling?: string; pain?: string; pain_area?: string } | null>(null);

  const todayIso = () => new Date().toISOString().slice(0, 10);
  // Merge so nastavovanie časti tela neprepíše intenzitu (a naopak). Explicitné
  // undefined v `next` pole zruší (napr. pri zmene nálady späť na „Dobre").
  const saveFeeling = (next: Partial<{ feeling: string; pain?: string; pain_area?: string }>) => {
    setFeeling((prev) => {
      const base = prev && (prev as any).date === todayIso() ? prev : {};
      const val = { ...base, date: todayIso(), ...next };
      try { localStorage.setItem(FEELING_KEY, JSON.stringify(val)); } catch { /* ignore */ }
      return val;
    });
  };

  useEffect(() => {
    store.loadDashboard();
    store.loadPlan();
    fetchProfile().then(setProfile).catch(() => {});
    try {
      const raw = localStorage.getItem(FEELING_KEY);
      if (raw) {
        const f = JSON.parse(raw);
        if (f?.date === todayIso()) setFeeling(f);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Konzistencia kľúčových (SOS) tréningov — počítaná na backende voči Hanson predpisu:
  // jedno okno (4 uzavreté týždne), jedna definícia SOS (Speed/Strength ut, Tempo št,
  // Dlhý beh ne), tri stavy (odbehnutý/vynechaný/zrušený). Viď _sos_consistency v main.py.
  const consistency = store.planConsistency as {
    weeks_scored: number; key_total: number; key_done: number;
    key_missed: number; key_cancelled: number;
  } | null;

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

  // Pretekový týždeň + výživa (kontextové karty)
  const weekNum = typeof d.training_week === "number" ? d.training_week : null;
  // Po dátume pretekov appka inak „zamrzne" v Taperi (týždeň sa clampuje na 18).
  const raceIsPast = (() => {
    if (!profile?.race_date) return false;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const r = new Date(profile.race_date + "T00:00:00");
    return !isNaN(r.getTime()) && r < t;
  })();
  const isRaceWeek = weekNum != null && weekNum >= 18 && !raceIsPast;
  // Just Finish nemá pretekový cieľový čas — rozpis tempa by protirečil filozofii „len dobehnúť".
  const isJustFinish = (profile?.plan_variant ?? d.plan_variant) === "just_finish";
  const splits = isRaceWeek && !isJustFinish ? goalSplits(profile?.target_time) : null;
  // Odpočítavanie do preteku (počas prípravy; v pretekovom týždni to pokrýva veľká karta)
  const countdown = !isRaceWeek ? raceCountdown(profile?.race_date) : null;
  const todayKind = todayWorkout ? classifyWorkout(todayWorkout.title || "").type : null;
  const showFueling = todayKind === "long" || isRaceWeek;

  // Stav formy = ŽIVÁ Body Battery (rozhodnutie „vládzem teraz?"), nie ranná —
  // dôležité pre večerný beh: ranná top forma už pred behom platiť nemusí.
  const formStatus = getFormStatus(sleep.score, stats.body_battery_now ?? stats.body_battery, readiness.readiness_score);

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
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-300">
              Ahoj, {data?.display_name ?? data?.garmin_email?.split("@")[0] ?? "Bežec"}
            </h1>
            <Hand className="text-amber-300 shrink-0" size={24} />
          </div>
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

      {/* Odpočítavanie do preteku */}
      {countdown && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-accent/10 border border-accent/20 rounded-2xl px-4 py-3 flex items-center gap-4"
        >
          <div className="bg-accent/20 text-accent p-2.5 rounded-xl shrink-0">
            <Trophy size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Do preteku</p>
            <p className="leading-tight">
              {countdown.days === 0 ? (
                <span className="text-2xl font-bold text-accent">Dnes je deň D! 🏁</span>
              ) : (
                <>
                  <span className="text-2xl font-bold text-accent">{countdown.days}</span>
                  <span className="text-gray-300"> {dayWord(countdown.days)}</span>
                  {countdown.weeks > 0 && (
                    <span className="text-xs text-gray-500">
                      {" "}· ≈ {countdown.weeks} {weekWord(countdown.weeks)}
                      {countdown.rem ? ` ${countdown.rem} ${dayWord(countdown.rem)}` : ""}
                    </span>
                  )}
                </>
              )}
            </p>
            <p className="text-[11px] text-gray-500 capitalize mt-0.5">{countdown.dateLabel}</p>
          </div>
        </motion.div>
      )}

      {/* Po pretekoch — gratulácia + výzva nastaviť ďalší cieľ */}
      {raceIsPast && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4"
        >
          <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-wider mb-1 flex items-center gap-2">
            <Trophy size={16} /> Preteky máš za sebou — gratulujeme! 🎉
          </h3>
          <p className="text-xs text-gray-300 leading-relaxed mb-3">
            Skvelá práca. Dopraj si pár dní aktívnej regenerácie (ľahké behy, spánok, jedlo).
            Keď budeš mať ďalší cieľ, nastav si <b className="text-gray-100">nový dátum pretekov</b> a
            cieľový čas — appka ti zostaví novú 18-týždňovú prípravu.
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300 underline underline-offset-2"
          >
            Nastaviť ďalšie preteky <ChevronRight size={14} />
          </Link>
        </motion.div>
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

      {/* Pretekový týždeň — taper + pretekový plán tempa */}
      {isRaceWeek && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4"
        >
          <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Trophy size={16} /> Pretekový týždeň
          </h3>
          <p className="text-xs text-gray-300 leading-relaxed mb-3">
            Si v taperi — menej behu, viac sviežosti. Žiadne tvrdé tréningy ani nové vzdialenosti.
            „Ťažké nohy" sú normálne, dôveruj príprave.
          </p>
          {splits && (
            <div className="bg-black/20 rounded-xl p-3 mb-3">
              <p className="text-xs text-gray-400 mb-2">
                Pretekový rozpis tempa — cieľ <b className="text-emerald-300">{splits.pace}/km</b>:
              </p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {splits.splits.map((s) => (
                  <div key={s.label}>
                    <p className="text-[10px] text-gray-500">{s.label}</p>
                    <p className="text-sm font-bold font-mono text-gray-200">{s.t}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {isJustFinish && (
            <div className="bg-black/20 rounded-xl p-3 mb-3">
              <p className="text-xs text-gray-300 leading-relaxed">
                Tvoj cieľ je <b className="text-emerald-300">v pohode dobehnúť</b> — žiadny pretekový rozpis tempa.
                Vyštartuj pomaly a pohodlne (Easy tempo), jedz a pi ako na dlhých behoch a nechaj si silu do záveru.
                Dôjsť do cieľa je úspech. 💪
              </p>
            </div>
          )}
          <ul className="text-xs text-gray-300 flex flex-col gap-1">
            <li>✅ Spánok navyše (najmä 2 noci pred pretekmi)</li>
            <li>✅ Sacharidy 2–3 dni pred + raňajky 2–3 h vopred</li>
            <li>✅ Hydratácia; neskúšaj nič nové (jedlo, topánky)</li>
            <li>✅ Deň pred: krátke rozklusanie 15–20 min</li>
          </ul>
        </motion.div>
      )}

      {/* Dokonči nastavenie — vodiaci checklist pre nového používateľa */}
      {profile && (!profile.target_time || !profile.race_date) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-primary/10 border border-primary/20 rounded-2xl p-4"
        >
          <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-2 flex items-center gap-2">
            <ListChecks size={16} /> Dokonči nastavenie
          </h3>
          <p className="text-xs text-gray-300 mb-3 leading-snug">
            Aby ti tréner zostavil presný plán, doplň pár vecí:
          </p>
          <ul className="flex flex-col gap-1.5 mb-3 text-sm">
            <li className="flex items-center gap-2">
              {profile.target_time
                ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                : <Circle size={16} className="text-gray-500 shrink-0" />}
              <span className={profile.target_time ? "text-gray-400 line-through" : "text-gray-200"}>Cieľový čas polmaratónu</span>
            </li>
            <li className="flex items-center gap-2">
              {profile.race_date
                ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                : <Circle size={16} className="text-gray-500 shrink-0" />}
              <span className={profile.race_date ? "text-gray-400 line-through" : "text-gray-200"}>Dátum pretekov</span>
            </li>
          </ul>
          <Link href="/settings" className="inline-flex items-center gap-1 text-xs font-bold text-primary underline underline-offset-2">
            Otvoriť nastavenia <ChevronRight size={14} />
          </Link>
        </motion.div>
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
              {" "}<b className="text-gray-100">nad 1,4</b> = priveľa priskoro (riziko preťaženia); <b className="text-gray-100">pod 0,8</b>
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

      {/* Self-report: ako sa cítiš — kŕmi dennú adaptáciu tréningu */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-4"
      >
        <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
          <Heart size={16} className="text-rose-400" /> Ako sa dnes cítiš?
        </h3>
        <p className="text-[11px] text-gray-500 mb-2 leading-snug">
          Podľa toho ti tréner prispôsobí najbližší tréning (tlačidlo „Prepočítať" v Pláne aj rady trénera).
          Zaznamenáva sa len v tomto zariadení na dnešný deň.
        </p>
        <div className="flex gap-2">
          {[
            { k: "ok", label: "💪 Dobre" },
            { k: "tired", label: "😓 Unavený" },
            { k: "pain", label: "🤕 Bolesť" },
          ].map((o) => (
            <button
              key={o.k}
              onClick={() =>
                o.k === "pain"
                  ? saveFeeling({ feeling: "pain" })
                  : saveFeeling({ feeling: o.k, pain: undefined, pain_area: undefined })
              }
              className={`flex-1 text-xs font-bold py-2 rounded-xl border transition-colors ${
                feeling?.feeling === o.k
                  ? "bg-primary/20 border-primary text-white"
                  : "bg-white/5 border-white/10 text-gray-300 hover:text-white"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {feeling?.feeling === "pain" && (
          <div className="flex gap-2 mt-2">
            {[{ k: "dull", label: "Tupá / svalová" }, { k: "sharp", label: "Ostrá / pretrváva" }].map((o) => (
              <button
                key={o.k}
                onClick={() => saveFeeling({ feeling: "pain", pain: o.k })}
                className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                  feeling?.pain === o.k
                    ? o.k === "sharp"
                      ? "bg-rose-500/20 border-rose-500/40 text-rose-200"
                      : "bg-amber-500/15 border-amber-500/30 text-amber-200"
                    : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        {feeling?.feeling === "pain" && (
          <div className="mt-2">
            <p className="text-[11px] text-gray-500 mb-1.5">Kde to bolí? (nepovinné — tréner to zohľadní)</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { k: "koleno", label: "Koleno" },
                { k: "achilovka", label: "Achilovka / lýtko" },
                { k: "holen", label: "Holeň" },
                { k: "stehno", label: "Stehno" },
                { k: "chodidlo", label: "Chodidlo" },
                { k: "bedro", label: "Bedro / slabina" },
                { k: "chrbat", label: "Chrbát" },
                { k: "ine", label: "Iné" },
              ].map((o) => (
                <button
                  key={o.k}
                  onClick={() => saveFeeling({ feeling: "pain", pain_area: feeling?.pain_area === o.k ? undefined : o.k })}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    feeling?.pain_area === o.k
                      ? "bg-rose-500/20 border-rose-500/40 text-rose-200"
                      : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {feeling?.feeling && (
          <div className="mt-3 text-xs leading-snug">
            {feeling.feeling === "ok" && <p className="text-gray-400">Super — drž sa plánu. 💪</p>}
            {feeling.feeling === "tired" && (
              <p className="text-gray-300">
                Cítiš sa unavený — zváž mierne zmäkčenie.{" "}
                <Link href="/plan" className="text-primary underline underline-offset-2">Prepočítať najbližší tréning</Link>.
              </p>
            )}
            {feeling.feeling === "pain" && !feeling.pain && (
              <p className="text-gray-400">Je tá bolesť ostrá alebo tupá?</p>
            )}
            {feeling.feeling === "pain" && feeling.pain === "dull" && (
              <p className="text-amber-300">
                Tupá svalová bolesť je pri kumulovanej únave bežná. Pokračuj opatrne; ak sa zhorší, spomaľ.
              </p>
            )}
            {feeling.feeling === "pain" && feeling.pain === "sharp" && (
              <p className="text-rose-300">
                Ostrá bolesť — dnes nebehaj tvrdo, daj si Easy alebo voľno.{" "}
                <Link href="/plan" className="text-rose-200 underline underline-offset-2 font-bold">
                  Zmeniť najbližší tréning na Easy
                </Link>.
              </p>
            )}
          </div>
        )}
      </motion.div>

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

            {/* Rozcvička pred behom + strečing po behu */}
            <div className="flex gap-2 mt-4 relative z-10">
              <Link
                href="/warmup?type=before"
                className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2.5 flex items-center gap-2 transition-colors"
              >
                <span className="text-lg leading-none">🏃</span>
                <span className="text-xs font-bold text-gray-200 leading-tight">Rozcvička<br /><span className="text-[10px] text-gray-500 font-normal">pred behom</span></span>
              </Link>
              <Link
                href="/warmup?type=after"
                className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2.5 flex items-center gap-2 transition-colors"
              >
                <span className="text-lg leading-none">🧘</span>
                <span className="text-xs font-bold text-gray-200 leading-tight">Strečing<br /><span className="text-[10px] text-gray-500 font-normal">po behu</span></span>
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-1 text-gray-300">Dnes oddychový deň</h2>
            <p className="text-gray-500 text-sm mb-3 max-w-[85%] leading-snug">
              Voľno a ľahká regenerácia sú súčasťou Hansonovej metódy — telo silnie počas oddychu.
              (Ak si dnes čakal tréning, over prepojenie Garminu alebo ho nájdeš v sekcii Plán.)
            </p>
            <details className="mb-4 text-sm">
              <summary className="cursor-pointer list-none text-primary font-bold text-xs">
                Voliteľne: silový / mobilitný blok 💪
              </summary>
              <div className="mt-2 text-xs text-gray-400 leading-relaxed flex flex-col gap-1.5">
                <p>Krátke posilnenie pre bežca (10–15 min, 2× týždenne, na voľný/easy deň — nie pred tvrdým tréningom):</p>
                <p className="text-gray-300">Drepy 2×12 · výpady 2×10/nohu · glute bridge 2×15 · plank 3×30–45 s · výpony na lýtka 2×15.</p>
                <p>Cross-training (bicykel, plávanie, eliptical) je OK ako doplnok na voľný/easy deň — nenahrádza kľúčové behy a nerob ho tvrdo.</p>
              </div>
            </details>
            <Link href="/plan">
              <span className="inline-flex items-center gap-1 text-primary text-sm font-bold">
                Pozrieť plán <ChevronRight size={16} />
              </span>
            </Link>
          </>
        )}
      </motion.section>

      {/* Výživa — kontextovo pri dlhom behu alebo v pretekovom týždni */}
      {showFueling && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4"
        >
          <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wider mb-1 flex items-center gap-2">
            <Apple size={16} /> Výživa {isRaceWeek ? "pred pretekmi" : "na dlhý beh"}
          </h3>
          <p className="text-xs text-gray-300 leading-relaxed">
            Pri behu nad ~75–90 min dopĺňaj sacharidy priebežne — orientačne ~30–60 g/h
            (gél, banán, ionťák). Ľahké sacharidy aj 1–2 h pred behom.{" "}
            {isRaceWeek
              ? "Použi presne to, čo máš vyskúšané z tréningu — nič nové."
              : "Dlhý beh je ideálny na nácvik pretekovej výživy."}{" "}
            <Link href="/about" className="text-amber-300 underline underline-offset-2">Viac</Link>.
          </p>
        </motion.div>
      )}

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
            <p><b className="text-rose-300">HRV</b> — variabilita srdcového tepu (ms), ukazovateľ regenerácie a stresu. Vyššie a stabilné hodnoty = oddýchnuté telo.</p>
            <p><b className="text-emerald-300">Body Battery</b> — odhad zásob energie tela (0–100). Ráno vysoké = si nabitý, nízke = treba oddych.</p>
            <p><b className="text-amber-300">Pokojový tep</b> — tep v pokoji (bpm). Nižší býva znakom lepšej kondície.</p>
            <p><b className="text-amber-300">Stres</b> — Garmin denný priemer stresu (0–100, z HRV). Do 25 nízky, 26–50 stredný, nad 50 vysoký. Dlhodobo vysoký = telo sa nestíha zotavovať.</p>
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
              {hrv.last_night ? `${hrv.last_night} ms` : hrv.status && hrv.status !== "unknown" ? hrvStatusSk(hrv.status) : "--"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Priem.: <span className="text-rose-300 font-bold">{hrv.weekly_avg ?? "--"} ms</span>
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
              <span className="text-[10px] text-gray-500 font-normal">pri zobudení</span>
            </div>
            <p className="text-2xl font-bold">{stats.body_battery ?? "--"}</p>
            <div className="w-full bg-gray-800 rounded-full h-1.5 mt-2">
              <div
                className="bg-emerald-400 h-1.5 rounded-full transition-all"
                style={{ width: `${stats.body_battery ?? 0}%` }}
              />
            </div>
            {stats.body_battery_now != null && (
              <p className="text-[11px] text-gray-500 mt-1.5">teraz: {stats.body_battery_now}</p>
            )}
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
            {stats.avg_stress != null && (
              <p className="text-[11px] text-gray-500 mt-1.5">
                Stres{" "}
                <span className={`font-bold ${stats.avg_stress < 26 ? "text-emerald-400" : stats.avg_stress < 51 ? "text-amber-400" : "text-rose-400"}`}>
                  {stats.avg_stress}
                </span>
                <span className="text-gray-600">/100</span>
              </p>
            )}
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
            <p className="text-xs text-gray-400 mt-2 truncate">{readinessLevelSk(readiness.readiness_status)}</p>
          )}
        </motion.div>
      </section>

      {/* Konzistencia kľúčových tréningov — jadro Hansonovej metódy (4 uzavreté týždne) */}
      {consistency && consistency.key_total > 0 && (() => {
        const { key_total, key_done, key_missed, key_cancelled, weeks_scored } = consistency;
        const pct = Math.round((key_done / key_total) * 100);
        const tone =
          pct >= 90 ? { text: "text-emerald-400", bar: "bg-emerald-400" }
          : pct >= 70 ? { text: "text-amber-400", bar: "bg-amber-400" }
          : { text: "text-rose-400", bar: "bg-rose-400" };
        const weeksLabel = weeks_scored === 1 ? "týždeň" : weeks_scored < 5 ? "týždne" : "týždňov";
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-4"
          >
            <h3 className="text-sm font-bold flex items-center gap-2 mb-0.5">
              <Flame className="text-accent" size={18} /> Konzistencia kľúčových tréningov
            </h3>
            <p className="text-[11px] text-gray-500 mb-3">
              Posledné {weeks_scored} {weeksLabel} · {isJustFinish ? "nedeľný dlhý beh" : "Speed/Strength (ut), Tempo (št), Dlhý beh (ne)"}
            </p>

            <div className="flex items-end gap-2 mb-2">
              <span className={`text-3xl font-bold leading-none ${tone.text}`}>{key_done}</span>
              <span className="text-lg text-gray-500 leading-none mb-0.5">/ {key_total}</span>
              <span className="text-xs text-gray-400 mb-1">odbehnutých</span>
              <span className={`ml-auto text-sm font-semibold ${tone.text}`}>{pct} %</span>
            </div>

            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden mb-3">
              <div className={`h-full rounded-full ${tone.bar} transition-all`} style={{ width: `${pct}%` }} />
            </div>

            {(key_missed > 0 || key_cancelled > 0) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3">
                {key_missed > 0 && (
                  <span className="text-rose-300"><b className="text-rose-400">{key_missed}</b> vynechaných</span>
                )}
                {key_cancelled > 0 && (
                  <span className="text-amber-300"><b className="text-amber-400">{key_cancelled}</b> zrušených</span>
                )}
              </div>
            )}

            <p className="text-xs text-gray-400 leading-snug">
              {key_missed === 0 && key_cancelled === 0
                ? "Všetky kľúčové tréningy odbehnuté — konzistencia je pilier Hansonovej metódy. 💪"
                : "Vynechaný = ostal v pláne, ale neodbehol si ho; zrušený = z kalendára úplne odstránený (tebou alebo trénerom). Zmäkčené tréningy rovnakého typu sa rátajú ako odbehnuté. Jeden výpadok nič nepokazí — séria oslabuje prípravu (jadrom Hansona je odbehnúť kľúčové tréningy)."}
            </p>
          </motion.div>
        );
      })()}

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
