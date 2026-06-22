"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Calendar, CheckCircle2, Circle, Clock, Loader2,
  Activity, Flame, ChevronRight, BarChart2, ChevronLeft, Sparkles, AlertTriangle,
  ChevronDown, CalendarRange
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchDailyUpdateProposal, confirmDailyUpdate,
  fetchWorkoutDetails, fetchActivityStats, fetchPlanOverview
} from "@/lib/api";
import { useStore } from "@/lib/store";
import { classifyWorkout } from "@/lib/workoutType";

const VARIANT_LABELS: Record<string, string> = {
  advanced: "Advanced", beginner: "Beginner", just_finish: "Just Finish",
};

// HR zóna farby pre tréningové kroky

const STEP_COLORS: Record<string, { border: string; text: string; label: string }> = {
  warmup:   { border: "border-l-orange-400", text: "text-orange-400",  label: "Rozcvička" },
  interval: { border: "border-l-rose-400",   text: "text-rose-400",    label: "Intervalový beh" },
  run:      { border: "border-l-blue-400",   text: "text-blue-400",    label: "Beh" },
  recovery: { border: "border-l-emerald-400",text: "text-emerald-400", label: "Zotavenie" },
  cooldown: { border: "border-l-green-400",  text: "text-green-400",   label: "Vychladenie" },
};

// Fázy 18-týždňového Hanson plánu (na vzdelávací prehľad oblúka prípravy)
const PHASES = [
  { key: "intro", label: "Úvod", start: 1, end: 1, color: "bg-sky-400",
    desc: "Rozbeh a adaptácia — zatiaľ len ľahké behy." },
  { key: "speed", label: "Speed", start: 2, end: 10, color: "bg-rose-400",
    desc: "Krátke rýchle intervaly @ 5K tempo — rozvoj rýchlosti a VO2max." },
  { key: "strength", label: "Strength", start: 11, end: 17, color: "bg-orange-400",
    desc: "Dlhšie intervaly tesne pod pretekovým tempom — sila a odolnosť. Objem vrcholí." },
  { key: "taper", label: "Taper", start: 18, end: 18, color: "bg-emerald-400",
    desc: "Posledný týždeň — menej behu, aby si na štart prišiel svieži." },
];

function phaseForWeek(week: number) {
  return PHASES.find((p) => week >= p.start && week <= p.end) ?? PHASES[0];
}

// Vzdelávací prehľad celého 18-týždňového oblúka s označením "Tu si"
function PhaseTimeline({ week }: { week: number | null }) {
  const TOTAL = 18;
  const w = week ?? 0;
  const pct = w ? Math.min(100, Math.max(0, ((w - 0.5) / TOTAL) * 100)) : 0;
  const cur = w ? phaseForWeek(w) : null;
  return (
    <div className="glass-card p-4">
      <div className="flex justify-between text-sm mb-3">
        <span className="font-bold">Tvoja cesta — 18 týždňov</span>
        <span className="text-primary font-bold">Týždeň {week ?? "?"} / {TOTAL}</span>
      </div>
      {/* Segmenty fáz (šírka = počet týždňov fázy) */}
      <div className="relative">
        <div className="flex gap-0.5 h-2.5 rounded-full overflow-hidden">
          {PHASES.map((p) => {
            const span = p.end - p.start + 1;
            const isCur = cur?.key === p.key;
            return (
              <div
                key={p.key}
                style={{ flexGrow: span }}
                className={`${p.color} ${isCur ? "opacity-100" : "opacity-30"} transition-opacity`}
                title={`${p.label} (T${p.start}${p.end !== p.start ? `–${p.end}` : ""})`}
              />
            );
          })}
        </div>
        {/* Marker "Tu si" */}
        {w > 0 && (
          <div className="absolute -top-1 -translate-x-1/2" style={{ left: `${pct}%` }}>
            <div className="w-2 h-4 rounded-full bg-white shadow ring-2 ring-[#0a0a0f]" />
          </div>
        )}
      </div>
      {/* Štítky fáz */}
      <div className="flex justify-between mt-2 text-[9px] text-gray-500 uppercase tracking-wide">
        {PHASES.map((p) => (
          <span key={p.key} className={cur?.key === p.key ? "text-gray-200 font-bold" : ""}>{p.label}</span>
        ))}
      </div>
      {cur && (
        <p className="text-xs text-gray-400 mt-3 leading-snug">
          <b className="text-gray-200">Teraz: {cur.label}.</b> {cur.desc}
        </p>
      )}
    </div>
  );
}

// Celý 18-týždňový plán (lazy-load z backendu pri prvom rozbalení)
function FullPlanOverview() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && !data && !loading) {
      setLoading(true);
      try { setData(await fetchPlanOverview()); } catch { /* ignore */ } finally { setLoading(false); }
    }
  };

  const weeks: any[] = data?.weeks ?? [];

  return (
    <div className="glass-card p-4">
      <button onClick={toggle} className="w-full flex items-center justify-between font-bold text-sm">
        <span className="flex items-center gap-2">
          <CalendarRange size={16} className="text-primary" /> Celý plán (18 týždňov)
        </span>
        <ChevronDown size={18} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3">
          {loading && (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="animate-spin" size={16} /> Načítavam…
            </div>
          )}
          {!loading && weeks.length > 0 && (
            <div className="flex flex-col gap-4">
              <p className="text-[11px] text-gray-500">
                Variant: {data.variant}. Nedeľa = dlhý beh každý týždeň, štvrtok = tempo.
              </p>
              {PHASES.map((ph) => {
                const wk = weeks.filter((w) => w.phase === ph.key);
                if (!wk.length) return null;
                return (
                  <div key={ph.key}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${ph.color}`} />
                      <span className="text-xs font-bold text-gray-200">
                        {ph.label} · T{ph.start}{ph.end !== ph.start ? `–${ph.end}` : ""}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-2 leading-snug">{ph.desc}</p>
                    <div className="flex flex-col gap-1.5">
                      {wk.map((w) => (
                        <div
                          key={w.week}
                          className={`text-xs rounded-lg px-2 py-1.5 leading-snug ${
                            w.is_current ? "bg-primary/15 border border-primary/30" : "bg-black/20"
                          }`}
                        >
                          <span className={`font-bold ${w.is_current ? "text-primary" : "text-gray-300"}`}>
                            T{w.week}{w.is_current ? " · tu si" : ""}
                          </span>
                          {w.tuesday ? (
                            <span className="text-gray-400"> — {w.tuesday}</span>
                          ) : (
                            <span className="text-gray-500"> — {w.week === 1 ? "len Easy behy (adaptácia)" : "taper — zostup objemu"}</span>
                          )}
                          {w.thursday && <span className="text-gray-500"> · {w.thursday}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!loading && data && weeks.length === 0 && (
            <p className="text-xs text-gray-500">Prehľad sa nepodarilo načítať.</p>
          )}
        </div>
      )}
    </div>
  );
}

// Slovenský popis posunu týždňa so správnym skloňovaním
function relWeekLabel(off: number): string {
  if (off === 0) return "Tento týždeň";
  const n = Math.abs(off);
  if (off < 0) return n === 1 ? "Minulý týždeň" : `Pred ${n} týždňami`;
  return n === 1 ? "Budúci týždeň" : `O ${n} ${n < 5 ? "týždne" : "týždňov"}`;
}

export default function Plan() {
  const store = useStore();
  const workouts = store.plan ?? [];
  const loading = store.planLoading;
  const error = store.planError;

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [detailsCache, setDetailsCache] = useState<Record<string, any>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [proposal, setProposal] = useState<any>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  // Týždeňová navigácia: 0 = aktuálny týždeň, -1 = pred., 1 = budc.
  const [weekOffset, setWeekOffset] = useState(0);

  // Aktuálny týždeň z backendu (dashboard)
  const trainingWeek = store.dashboard?.training_week ?? null;

  // Výpočet rozpätia zobrazeného týždňa
  const weekRange = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Začiatok aktuálneho týždňa = pondelok
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + mondayOffset + weekOffset * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return { start: weekStart, end: weekEnd };
  }, [weekOffset]);

  // Filtrované tréningy pre aktuálne zobrazený týždeň
  const visibleWorkouts = useMemo(() => {
    return workouts.filter((w: any) => {
      const d = new Date(w.date + "T00:00:00");
      return d >= weekRange.start && d <= weekRange.end;
    });
  }, [workouts, weekRange]);

  const SOS_TYPES = ["speed", "strength", "tempo", "long"];
  const isMissedSos = (w: any): boolean => {
    if (w.activityId) return false; // splnené
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(w.date + "T00:00:00");
    return d < today && SOS_TYPES.includes(classifyWorkout(w.title).type);
  };

  // Vynechané kľúčové (SOS) tréningy — najnovšie prvé (posledných ~14 dní)
  const missedSos = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    return (workouts as any[])
      .filter((w) => isMissedSos(w) && new Date(w.date + "T00:00:00") >= cutoff)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workouts]);

  useEffect(() => {
    store.loadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDailyUpdate = async () => {
    try {
      setIsUpdating(true);
      setUpdateMessage(null);
      setProposal(null);
      const res = await fetchDailyUpdateProposal();
      if (res?.status === "success") {
        setProposal(res);
      } else {
        setUpdateMessage({ type: "error", text: res?.message || "Nepodarilo sa nájsť tréning na úpravu." });
      }
    } catch (err: any) {
      setUpdateMessage({ type: "error", text: err.message || "Nepodarilo sa prepočítať tréning." });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmUpdate = async () => {
    if (!proposal) return;
    try {
      setIsConfirming(true);
      setUpdateMessage(null);
      const res = await confirmDailyUpdate(
        proposal.proposed_workout,
        proposal.old_workout_id,
        proposal.target_date_str
      );
      if (res?.status === "success") {
        setUpdateMessage({ type: "success", text: "Tréning bol úspešne upravený v Garmine!" });
        setProposal(null);
        await store.loadPlan(true);
      }
    } catch (err: any) {
      setUpdateMessage({ type: "error", text: err.message || "Nepodarilo sa uložiť tréning." });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleExpand = async (index: number, workout: any) => {
    const key = workout.workoutId || workout.activityId || String(index);
    if (expandedId === index) { setExpandedId(null); return; }
    setExpandedId(index);
    if (detailsCache[key] || loadingDetails[key]) return;

    setLoadingDetails((prev) => ({ ...prev, [key]: true }));
    try {
      const isCompleted = !!workout.activityId;
      if (isCompleted) {
        const res = await fetchActivityStats(workout.activityId);
        setDetailsCache((prev) => ({
          ...prev,
          [key]: res?.stats ? { type: "activity", ...res } : { type: "no_activity" },
        }));
      } else if (workout.workoutId) {
        const res = await fetchWorkoutDetails(workout.workoutId);
        setDetailsCache((prev) => ({
          ...prev,
          [key]: res?.workout ? { type: "planned", ...res.workout } : { type: "planned", description: "" },
        }));
      } else {
        setDetailsCache((prev) => ({ ...prev, [key]: { type: "planned", description: workout.description || "" } }));
      }
    } catch (err) {
      console.error("Failed to load details", err);
    } finally {
      setLoadingDetails((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (loading && workouts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen pb-24">
        <Loader2 className="animate-spin text-primary" size={48} />
        <p className="text-gray-400 mt-4 font-bold">Sťahujem tvoj plán...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pt-4 pb-32">
      <header>
        <h1 className="text-3xl font-bold mb-1">Tréningový Plán</h1>
        <p className="text-gray-400 text-sm">
          Hanson {VARIANT_LABELS[store.dashboard?.plan_variant ?? "advanced"] ?? "Advanced"} Half-Marathon
        </p>
      </header>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm font-bold break-words">
          ⚠️ {error}
        </div>
      )}

      {updateMessage && (
        <div
          className={`p-4 rounded-xl text-sm font-bold break-words border ${
            updateMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}
        >
          {updateMessage.text}
        </div>
      )}

      {/* Vynechané kľúčové (SOS) tréningy */}
      {!proposal && missedSos.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-rose-300 flex items-center gap-2 mb-1">
            <AlertTriangle size={16} /> Vynechané kľúčové tréningy ({missedSos.length})
          </h3>
          <p className="text-xs text-gray-300 leading-relaxed mb-3">
            Posledný:{" "}
            <b>{classifyWorkout(missedSos[0].title).label}</b> — {missedSos[0].title}{" "}
            ({new Date(missedSos[0].date + "T00:00:00").toLocaleDateString("sk-SK", { day: "numeric", month: "long" })}).
            Podľa Hansona kľúčové tréningy nehromaď — buď ho čo najskôr dobehni, alebo ho vynechaj a
            pokračuj podľa plánu (nikdy nie 2 tvrdé dni za sebou).
          </p>
          <button
            onClick={handleDailyUpdate}
            disabled={isUpdating}
            className="inline-flex items-center gap-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-200 text-xs font-bold px-3 py-2 rounded-xl transition-colors disabled:opacity-60"
          >
            {isUpdating ? <Loader2 className="animate-spin" size={14} /> : <Activity size={14} />}
            Prepočítať najbližší tréning
          </button>
        </div>
      )}

      {/* Akcie trénera */}
      {!proposal && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Tréner — akcie</h2>

          {/* Vytvoriť nový plán */}
          <Link
            href="/plan/generator"
            className="glass-card p-4 flex items-center gap-4 hover:border-primary/40 border border-transparent transition-colors"
          >
            <div className="bg-primary/15 text-primary p-3 rounded-xl shrink-0">
              <Sparkles size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold">Vygenerovať plán na 7 dní</p>
              <p className="text-xs text-gray-400 leading-snug mt-0.5">
                AI navrhne tréningy na najbližší týždeň. Najprv ich uvidíš — do Garminu sa zapíšu až po tvojom schválení.
              </p>
            </div>
            <ChevronRight size={18} className="text-gray-500 shrink-0" />
          </Link>

          {/* Upraviť najbližší tréning */}
          <button
            onClick={handleDailyUpdate}
            disabled={isUpdating}
            className="glass-card p-4 flex items-center gap-4 text-left hover:border-accent/40 border border-transparent transition-colors disabled:opacity-60 w-full"
          >
            <div className="bg-accent/15 text-accent p-3 rounded-xl shrink-0">
              {isUpdating ? <Loader2 className="animate-spin" size={22} /> : <Activity size={22} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold">{isUpdating ? "Prepočítavam…" : "Upraviť najbližší tréning"}</p>
              <p className="text-xs text-gray-400 leading-snug mt-0.5">
                AI prepočíta tvoj najbližší tréning podľa aktuálnej formy (tep, únava, spánok). Návrh schváliš pred uložením.
              </p>
            </div>
            {!isUpdating && <ChevronRight size={18} className="text-gray-500 shrink-0" />}
          </button>
        </section>
      )}

      {/* AI Proposal */}
      <AnimatePresence>
        {proposal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-card p-5 border border-primary/30 relative overflow-hidden"
          >
            <div className="absolute -top-10 -right-10 opacity-5">
              <Flame size={150} />
            </div>
            <h3 className="text-primary font-bold mb-2">Tréner radí</h3>
            <p className="text-gray-300 text-sm mb-4 italic leading-relaxed">
              "{proposal.coach_message}"
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                <p className="text-xs font-bold text-rose-400 uppercase mb-2">❌ Pôvodný tréning</p>
                <p className="font-bold mb-2">
                  {proposal.original_workout?.title || proposal.original_workout?.workoutName}
                </p>
                {/* Kroky pôvodného tréningu */}
                {proposal.original_steps?.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {proposal.original_steps.map((s: any, idx: number) => (
                      <div key={idx} className="text-xs text-gray-400 flex justify-between bg-black/20 p-1.5 rounded">
                        <span className="capitalize">{s.type}</span>
                        <span>{s.distance_km ? `${s.distance_km}km` : ""}{s.target ? ` @ ${s.target}` : ""}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 italic">Kroky pôvodného tréningu nie sú dostupné.</p>
                )}
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                <p className="text-xs font-bold text-emerald-400 uppercase mb-2">✅ AI Návrh</p>
                <p className="font-bold">{proposal.proposed_workout?.workout_name}</p>
                <div className="mt-2 flex flex-col gap-1">
                  {proposal.proposed_workout?.steps?.map((s: any, idx: number) => (
                    <div key={idx} className="text-xs text-gray-300 flex justify-between bg-black/20 p-1.5 rounded">
                      <span className="capitalize">{s.type}</span>
                      <span>{s.distance_km}km @ {s.pace_max}-{s.pace_min}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setProposal(null)}
                disabled={isConfirming}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                Zrušiť
              </button>
              <button
                onClick={handleConfirmUpdate}
                disabled={isConfirming}
                className="flex-1 bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl text-sm transition-colors shadow-[0_0_15px_rgba(59,130,246,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isConfirming && <Loader2 className="animate-spin" size={18} />}
                {isConfirming ? "Ukladám..." : "Schváliť a nahrať"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Prehľad 18-týždňového oblúka prípravy (vzdelávací) */}
      <PhaseTimeline week={trainingWeek} />

      {/* Celý 18-týždňový plán (rozbaľovací) */}
      <FullPlanOverview />

      {/* Taper / pretekový týždeň */}
      {trainingWeek != null && trainingWeek >= 18 && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2 mb-1">
            <Sparkles size={16} /> Pretekový týždeň — taper
          </h3>
          <p className="text-xs text-gray-300 leading-relaxed">
            Toto je zostupový týždeň: výrazne menej behu, aby si na štart prišiel svieži.
            Žiadne nové vzdialenosti ani tvrdé intervaly — len krátke ľahké behy s pár úsekmi
            v pretekovom tempe. „Ťažké nohy" a nervozita sú normálne, dôveruj príprave.
            Priorita: spánok, sacharidy, hydratácia.{" "}
            <Link href="/about" className="text-emerald-300 underline underline-offset-2">Viac o taperi</Link>.
          </p>
        </div>
      )}

      {/* Zoznam tréningov */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calendar className="text-primary" size={20} /> Garmin Kalendár
          </h2>
          <span className="bg-white/10 px-3 py-1 rounded-full text-xs">{visibleWorkouts.length} tréningov</span>
        </div>

        {/* Týždeňová navigácia */}
        <div className="flex items-center justify-between mb-4 glass-card px-3 py-2">
          <button
            onClick={() => { setWeekOffset(o => o - 1); setExpandedId(null); }}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <p className="text-sm font-bold">
              {weekRange.start.toLocaleDateString("sk-SK", { day: "numeric", month: "long" })} – {weekRange.end.toLocaleDateString("sk-SK", { day: "numeric", month: "long" })}
            </p>
            <p className="text-xs text-gray-500">
              {relWeekLabel(weekOffset)}
            </p>
          </div>
          <button
            onClick={() => { setWeekOffset(o => o + 1); setExpandedId(null); }}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {visibleWorkouts.length === 0 && !error && (
            <div className="text-center py-10">
              <p className="text-gray-500 mb-3">
                {loading ? "Načítavam..." : "Tento týždeň nemáš žiadne naplánované tréningy."}
              </p>
              {!loading && weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} className="text-primary text-sm underline">
                  Zobraziť aktuálny týždeň
                </button>
              )}
            </div>
          )}

          {visibleWorkouts.map((workout: any, i: number) => {
            const wDate = new Date(workout.date + "T00:00:00");
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isToday = wDate.getTime() === today.getTime();
            const isPast = wDate.getTime() < today.getTime();
            const isExpanded = expandedId === i;
            const key = workout.workoutId || workout.activityId || String(i);
            const details = detailsCache[key];
            const isLoadingDetails = loadingDetails[key];
            const days = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];

            return (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                key={i}
                onClick={() => handleExpand(i, workout)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  isToday
                    ? "bg-primary/20 border-primary shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                    : "glass-card hover:bg-white/5 border-transparent"
                } flex flex-col gap-2`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-center justify-center w-10 shrink-0">
                    <span className="text-xs text-gray-500 uppercase">{days[wDate.getDay()]}</span>
                    <span className={`font-bold ${isToday ? "text-primary" : "text-gray-300"}`}>
                      {wDate.getDate()}.
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-bold ${isToday ? "text-white" : "text-gray-200"}`}>
                        {workout.title}
                      </h3>
                      {!workout.activityId && (() => {
                        const c = classifyWorkout(workout.title);
                        return (
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${c.badge}`}>
                            {c.label}
                          </span>
                        );
                      })()}
                      {isMissedSos(workout) && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-rose-500/20 text-rose-300 border-rose-500/40 flex items-center gap-1">
                          <AlertTriangle size={10} /> Vynechané
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{workout.sportType?.typeKey || "Beh"}</p>
                    {!workout.activityId && (() => {
                      const c = classifyWorkout(workout.title);
                      return c.why ? (
                        <p className="text-[11px] text-gray-500 italic mt-1 leading-snug">💡 {c.why}</p>
                      ) : null;
                    })()}
                  </div>

                  <div className="shrink-0">
                    {/* Zelená fajka IBA ak existuje activityId (reálne absolvovaný) */}
                    {workout.activityId && <CheckCircle2 className="text-emerald-400" size={22} />}
                    {/* Šedé koláč = minulý, ale bez activity */}
                    {isPast && !workout.activityId && <CheckCircle2 className="text-gray-600" size={22} />}
                    {isToday && !workout.activityId && <Clock className="text-primary" size={22} />}
                    {!isPast && !isToday && <Circle className="text-gray-600" size={22} />}
                  </div>
                </div>

                {/* Detail panel */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 pt-4 border-t border-white/10 text-sm text-gray-300">
                        {isLoadingDetails ? (
                          <div className="flex items-center gap-2 text-primary">
                            <Loader2 className="animate-spin" size={16} /> Načítavam dáta...
                          </div>
                        ) : details?.type === "activity" ? (
                          // ── Splnený beh: reálne štatistiky + porovnanie ──
                          <div className="flex flex-col gap-3">
                            <div className="grid grid-cols-2 gap-2">
                              {details.stats?.distance_km && (
                                <div className="bg-black/20 p-2 rounded-lg">
                                  <p className="text-xs text-gray-500">Vzdialenosť</p>
                                  <p className="font-bold text-white">{details.stats.distance_km} km</p>
                                </div>
                              )}
                              {details.stats?.avg_pace_sec_km && (
                                <div className="bg-black/20 p-2 rounded-lg">
                                  <p className="text-xs text-gray-500">Priem. tempo</p>
                                  <p className="font-bold text-primary font-mono">
                                    {Math.floor(details.stats.avg_pace_sec_km / 60)}:
                                    {String(details.stats.avg_pace_sec_km % 60).padStart(2, "0")}/km
                                  </p>
                                </div>
                              )}
                              {details.stats?.avg_hr && (
                                <div className="bg-black/20 p-2 rounded-lg">
                                  <p className="text-xs text-gray-500">Priem. tep</p>
                                  <p className="font-bold text-rose-400">{details.stats.avg_hr} bpm</p>
                                </div>
                              )}
                              {details.stats?.avg_cadence && (
                                <div className="bg-black/20 p-2 rounded-lg">
                                  <p className="text-xs text-gray-500">Kadencia</p>
                                  <p className="font-bold text-emerald-400">{details.stats.avg_cadence} spm</p>
                                </div>
                              )}
                              {details.stats?.calories && (
                                <div className="bg-black/20 p-2 rounded-lg">
                                  <p className="text-xs text-gray-500">Kalórie</p>
                                  <p className="font-bold text-orange-400">{details.stats.calories} kcal</p>
                                </div>
                              )}
                              {details.stats?.training_effect && (
                                <div className="bg-black/20 p-2 rounded-lg">
                                  <p className="text-xs text-gray-500">Aeróbny efekt</p>
                                  <p className="font-bold text-purple-400">
                                    {details.stats.training_effect.toFixed(1)}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : details?.type === "no_activity" ? (
                          <p className="italic text-gray-500">
                            Aktivita sa nenachádza v Garmine (možno ešte nebola synchronizovaná).
                          </p>
                        ) : details?.type === "planned" ? (
                          // ── Plánovaný tréning: kroky so zónovými farbami ──
                          <div className="flex flex-col gap-3">
                            {details.total_distance_km && (
                              <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-bold">{details.total_distance_km}</span>
                                <span className="text-gray-400 text-sm">km celkom</span>
                              </div>
                            )}
                            {details.description && (
                              <div className="bg-black/20 rounded-xl p-3">
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">
                                  Poznámky
                                </p>
                                <p className="text-sm text-gray-300 leading-relaxed">{details.description}</p>
                              </div>
                            )}
                            {details.steps_summary?.length > 0 && (
                              <div className="flex flex-col gap-2">
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Kroky</p>
                                {details.steps_summary.map((step: any, si: number) => {
                                  const c = STEP_COLORS[step.type] || {
                                    border: "border-l-primary",
                                    text: "text-primary",
                                    label: step.type,
                                  };
                                  return (
                                    <div
                                      key={si}
                                      className={`bg-black/20 rounded-xl border-l-4 ${c.border} p-3`}
                                    >
                                      <div className="flex items-start justify-between mb-1">
                                        <span className={`font-bold text-sm ${c.text}`}>{c.label}</span>
                                        {step.distance_km ? (
                                          <span className="text-gray-400 text-xs">{step.distance_km} km</span>
                                        ) : step.duration_min ? (
                                          <span className="text-gray-400 text-xs">{step.duration_min} min</span>
                                        ) : null}
                                      </div>
                                      {step.target && (
                                        <p className="text-xs text-gray-400 mb-1">
                                          {step.target_kind === "hr" ? "❤️" : "⏱"} {step.target}
                                        </p>
                                      )}
                                      {step.notes && (
                                        <p className="text-xs text-gray-500 italic">{step.notes}</p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {!details.description && !details.steps_summary?.length && (
                              <p className="italic text-gray-500 text-sm">
                                K tomuto tréningu nie je uložený popis.
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="italic text-gray-500">
                            {workout.description || "Kliknutím načítam detaily tréningu."}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
