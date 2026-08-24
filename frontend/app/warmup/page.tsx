"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Play, Info, ChevronRight, ChevronLeft,
  Check, Timer, Pause, ListChecks, Sparkles,
} from "lucide-react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { exercisesFor, videoUrl, sideLabel, totalRounds, type WarmupPhase, type Exercise } from "@/lib/warmup";

const PHASE_META: Record<WarmupPhase, { title: string; subtitle: string; mins: string }> = {
  before:   { title: "Dynamická rozcvička", subtitle: "Pripravíš telo na beh",        mins: "~8 min" },
  after:    { title: "Strečing po behu",    subtitle: "Podporíš regeneráciu",          mins: "~7 min" },
  strength: { title: "Silový / voľný deň",  subtitle: "Doplnková sila a stabilita",    mins: "~15–20 min" },
};

// Zvuková a hmatová spätná väzba na konci odpočtu: pri strečingu má človek hlavu pri
// kolene a na displej sa nepozerá, takže samotné číslo mu je nanič.
let audioCtx: AudioContext | null = null;

function playCue(kind: "warn" | "end") {
  try {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      const ctx = audioCtx ?? new Ctor();
      audioCtx = ctx;
      // Prehliadač prebudí zvuk až po dotyku — vedený režim používateľ spúšťa klepnutím.
      if (ctx.state === "suspended") void ctx.resume();
      const now = ctx.currentTime;
      const beeps = kind === "end" ? [0, 0.18, 0.36] : [0];   // koniec = tri pípnutia, 5 s vopred = jedno
      for (const at of beeps) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = kind === "end" ? 880 : 620;
        gain.gain.setValueAtTime(0.0001, now + at);
        gain.gain.exponentialRampToValueAtTime(0.22, now + at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + at);
        osc.stop(now + at + 0.16);
      }
    }
  } catch {
    // Web Audio nemusí byť dostupné (starší prehliadač, zakázaný zvuk) — odpočet beží ďalej.
  }
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(kind === "end" ? [120, 60, 120] : 60);
    }
  } catch {
    // Vibrácie na desktope a v iOS Safari chýbajú — signál je len bonus, nie podmienka.
  }
}

// Jedna „dlaždica" cviku v režime prehliadania
function ExerciseCard({ ex, idx }: { ex: Exercise; idx: number }) {
  const [showWhy, setShowWhy] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.03 }}
      className="glass-card p-4"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="text-2xl w-11 h-11 flex items-center justify-center bg-primary/10 rounded-xl shrink-0">
          {ex.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm text-gray-100">{ex.name}</h3>
          <p className="text-primary text-xs font-bold mt-0.5">{ex.dose}</p>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300 shrink-0 text-center leading-tight">
          {ex.muscles}
        </span>
      </div>

      <ol className="flex flex-col gap-1.5 mb-2">
        {ex.steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-xs text-gray-300 leading-snug">
            <span className="bg-primary/20 text-primary w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>

      {ex.mistake && (
        <p className="text-[11px] text-amber-300/90 leading-snug mb-2 flex gap-1.5">
          <span className="shrink-0">⚠️</span>
          <span><b className="text-amber-300">Častá chyba:</b> {ex.mistake}</span>
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={() => setShowWhy((v) => !v)}
          className="text-[11px] text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
        >
          <Info size={13} /> Prečo tento cvik?
        </button>
        {ex.videoQuery && (
          <a
            href={videoUrl(ex.videoQuery)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-primary hover:underline flex items-center gap-1"
          >
            <Play size={12} /> Ukázať video
          </a>
        )}
      </div>
      <AnimatePresence>
        {showWhy && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden text-[11px] text-gray-400 leading-relaxed border-l-2 border-primary/30 pl-2.5 mt-2"
          >
            {ex.why}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Telo obrazovky; default export ho nižšie obalí do MotionConfig-u.
function WarmupScreen() {
  const [phase, setPhase] = useState<WarmupPhase>("before");
  const [mode, setMode] = useState<"browse" | "guided" | "done">("browse");
  const [idx, setIdx] = useState(0);
  const [round, setRound] = useState(0);      // poradie série/strany v rámci jedného cviku
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const prevSecRef = useRef<number | null>(null);

  const list = exercisesFor(phase);
  const ex = list[idx];
  const meta = PHASE_META[phase];

  // Deep-link: /warmup?type=after otvorí rovno strečing po behu
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("type");
    if (t === "after" || t === "strength") setPhase(t);
  }, []);

  // Časovač sa pripraví aj pri zmene série/strany — inak by sa odmeral len prvý beh
  useEffect(() => {
    const cur = exercisesFor(phase)[idx];
    if (cur?.durationSec) {
      setSecondsLeft(cur.durationSec);
      setRunning(true);
    } else {
      setSecondsLeft(0);
      setRunning(false);
    }
  }, [idx, phase, mode, round]);

  // Odpočet pre statický strečing (1 tik = 1 s, plánovaný cez setTimeout)
  useEffect(() => {
    if (mode !== "guided" || !running || !ex?.durationSec || secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [mode, running, secondsLeft, ex, phase]);

  // Signál púšťame len pri skutočnom tiku nadol; pri prípravnom nastavení časovača
  // hodnota stúpa, a bez tejto poistky by pípol hneď pri otvorení cviku.
  useEffect(() => {
    const prevSec = prevSecRef.current;
    prevSecRef.current = secondsLeft;
    if (mode !== "guided" || !ex?.durationSec || prevSec === null || secondsLeft >= prevSec) return;
    if (secondsLeft === 5) playCue("warn");
    if (secondsLeft === 0) playCue("end");
  }, [secondsLeft, mode, ex]);

  const switchPhase = (p: WarmupPhase) => {
    setPhase(p);
    setIdx(0);
    setRound(0);
    setMode("browse");
  };

  const startGuided = () => { setIdx(0); setRound(0); setMode("guided"); };

  // Cvik je hotový až po odbehnutí všetkých sérií a oboch strán — inak by sa ľavá noha
  // ani druhá séria nikdy nedostali na rad.
  const rounds = ex ? totalRounds(ex) : 1;
  const sidesCount = ex?.sides === "both" ? 2 : 1;
  const setsCount = ex?.sets ?? 1;
  const setNo = Math.floor(round / sidesCount) + 1;   // v sérii ideme najprv pravú, potom ľavú stranu
  const sideNo = round % sidesCount;
  // To isté pre nasledujúcu dávku — potrebuje to panel „Ďalej:" pod tlačidlami
  const nextSetNo = Math.floor((round + 1) / sidesCount) + 1;
  const nextSideNo = (round + 1) % sidesCount;

  // Postup meriame v dávkach, nie v cvikoch: pri Bočnej doske (3 série × 2 strany = 6 dávok)
  // by sa ukazovateľ inak počas celého cviku vôbec nepohol.
  const totalDoses = list.reduce((sum, e) => sum + totalRounds(e), 0);
  const doneDoses = list.slice(0, idx).reduce((sum, e) => sum + totalRounds(e), 0) + round + 1;

  const next = () => {
    if (round < rounds - 1) { setRound(round + 1); return; }
    setRound(0);                                       // ďalší cvik začína opäť prvou sériou
    if (idx < list.length - 1) setIdx(idx + 1); else setMode("done");
  };
  const prev = () => {
    if (round > 0) { setRound(round - 1); return; }
    // Krok späť musí byť zrkadlom kroku vpred — vraciame sa na POSLEDNÚ dávku predošlého
    // cviku, inak by si zverenec po kroku späť a vpred musel zopakovať všetky jeho dávky.
    if (idx > 0) { setIdx(idx - 1); setRound(totalRounds(list[idx - 1]) - 1); }
  };

  const isTimer = !!ex?.durationSec;
  const timerDone = isTimer && secondsLeft <= 0;

  // Po dobehnutí odpočtu tlačidlo posúva ďalej — popis pre čítačku obrazovky musí sedieť
  // s tým, kam naozaj vedie (ďalšia dávka / ďalší cvik / koniec), nie len s prvou možnosťou.
  const timerAriaLabel = timerDone
    ? round < rounds - 1
      ? "Pokračovať ďalšou dávkou"
      : idx < list.length - 1
      ? "Pokračovať ďalším cvikom"
      : "Dokončiť"
    : running
    ? "Pozastaviť časovač"
    : "Spustiť časovač";

  // ── Hotovo ──────────────────────────────────────────────────────────────────
  if (mode === "done") {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-4 pt-16 pb-32">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-emerald-500/15 text-emerald-400 w-20 h-20 rounded-full flex items-center justify-center"
        >
          <Check size={44} strokeWidth={3} />
        </motion.div>
        <h1 className="text-2xl font-bold">
          {phase === "before" ? "Rozcvička hotová! 💪" : phase === "after" ? "Strečing hotový! 🧘" : "Silový tréning hotový! 💪"}
        </h1>
        <p className="text-gray-400 text-sm max-w-xs leading-relaxed">
          {phase === "before"
            ? "Telo máš rozohriate a pripravené. Uži si beh a drž sa svojich temp!"
            : phase === "after"
            ? "Super práca. Pravidelný strečing po behu je najlacnejšia prevencia zranení."
            : "Super práca. Doplnková sila a stabilita ťa spravia odolnejším a ekonomickejším bežcom."}
        </p>
        <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
          <button
            onClick={() => setMode("browse")}
            className="glass-card py-3 text-sm font-bold text-gray-200 hover:bg-white/5 transition-colors"
          >
            Späť na zoznam cvikov
          </button>
          {phase === "before" ? (
            <button
              onClick={() => switchPhase("after")}
              className="bg-primary/15 border border-primary/30 text-primary py-3 rounded-2xl text-sm font-bold hover:bg-primary/25 transition-colors"
            >
              Po behu: ukázať strečing →
            </button>
          ) : (
            <Link
              href="/"
              className="bg-primary/15 border border-primary/30 text-primary py-3 rounded-2xl text-sm font-bold hover:bg-primary/25 transition-colors"
            >
              Späť na prehľad
            </Link>
          )}
        </div>
      </div>
    );
  }

  // ── Vedený režim (krok za krokom) ─────────────────────────────────────────────
  if (mode === "guided" && ex) {
    return (
      <div className="flex flex-col gap-4 pt-4 pb-32">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMode("browse")}
            className="bg-white/5 border border-white/10 text-gray-400 hover:text-white p-2 rounded-xl transition-colors"
            aria-label="Späť na zoznam"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-1.5">Cvik {idx + 1} z {list.length}</p>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                animate={{ width: `${(doneDoses / totalDoses) * 100}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={ex.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            className="glass-card border border-primary/20 p-5 text-center"
          >
            <div className="text-5xl mb-2 leading-none">{ex.icon}</div>
            <h2 className="text-xl font-bold text-gray-100">{ex.name}</h2>
            <span className="inline-block text-[11px] text-accent bg-accent/15 border border-accent/30 rounded-full px-3 py-0.5 mt-2">
              {ex.muscles}
            </span>

            {/* Bez tohto štítku užívateľ netuší, že ho čaká ešte ďalšia séria alebo druhá noha */}
            {rounds > 1 && (
              <div className="flex items-center justify-center gap-1.5 mt-2.5 flex-wrap">
                {setsCount > 1 && (
                  <span className="text-[11px] font-bold text-primary bg-primary/15 border border-primary/30 rounded-full px-3 py-0.5">
                    Séria {setNo} z {setsCount}
                  </span>
                )}
                {sidesCount > 1 && (
                  <span className="text-[11px] font-bold text-gray-200 bg-white/5 border border-white/10 rounded-full px-3 py-0.5">
                    {sideLabel(ex, sideNo)}
                  </span>
                )}
              </div>
            )}

            {isTimer ? (
              <button
                onClick={() => { if (timerDone) { next(); } else { setRunning((r) => !r); } }}
                className="mt-4 mb-1 mx-auto flex flex-col items-center group"
                aria-label={timerAriaLabel}
              >
                <span className={`text-5xl font-bold font-mono tabular-nums ${timerDone ? "text-emerald-400" : "text-primary"}`}>
                  {timerDone ? "✓" : secondsLeft}
                </span>
                {!timerDone && (
                  <span className="text-[11px] text-gray-500 flex items-center gap-1 mt-1">
                    {running ? <><Pause size={11} /> klepni pre pauzu</> : <><Play size={11} /> klepni pre štart</>}
                  </span>
                )}
                {timerDone && round < rounds - 1 && (
                  <span className="text-[11px] text-gray-500 mt-1">klepni pre ďalšiu dávku</span>
                )}
              </button>
            ) : (
              // Vo vedenom režime ukazujeme dávku na JEDNU sériu — vedľa štítku „Séria 1 z 3"
              // by celková dávka („3× 12–15") zvádzala k trojnásobku.
              <p className="text-2xl font-bold text-primary mt-4 mb-1">{ex.dosePerSet ?? ex.dose}</p>
            )}

            <ol className="flex flex-col gap-2 text-left mt-4 bg-black/20 rounded-xl p-3.5">
              {ex.steps.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-gray-300 leading-snug">
                  <span className="bg-primary/20 text-primary w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>

            <p className="text-[11px] text-gray-500 leading-relaxed mt-3 flex gap-1.5 text-left">
              <Info size={13} className="text-gray-500 shrink-0 mt-0.5" />
              <span>{ex.why}</span>
            </p>
            {ex.mistake && (
              <p className="text-[11px] text-amber-300/90 leading-relaxed mt-2 flex gap-1.5 text-left">
                <span className="shrink-0">⚠️</span>
                <span><b className="text-amber-300">Častá chyba:</b> {ex.mistake}</span>
              </p>
            )}
            {ex.videoQuery && (
              <a
                href={videoUrl(ex.videoQuery)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-3"
              >
                <Play size={13} /> Ukázať referenčné video
              </a>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-2">
          <button
            onClick={prev}
            disabled={idx === 0 && round === 0}
            className="px-4 py-3 rounded-2xl border border-white/10 bg-white/5 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
            aria-label={round > 0 ? "Späť na predošlú sériu/stranu" : "Predošlý cvik"}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={next}
            className="flex-1 bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-2xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {round < rounds - 1
              ? (sidesCount > 1 && sideNo === 0
                  ? <>Hotovo, teraz {sideLabel(ex, 1).toLowerCase()} <ChevronRight size={16} /></>
                  : <>Hotovo, séria {setNo + 1} z {setsCount} <ChevronRight size={16} /></>)
              : idx === list.length - 1
              ? <>Dokončiť <Check size={16} /></>
              : <>Hotovo, ďalší cvik <ChevronRight size={16} /></>}
          </button>
        </div>

        {/* Kým cvik nemá odbehnuté všetky dávky, „ďalej" nie je ďalší cvik, ale ďalšia dávka */}
        {round < rounds - 1 ? (
          <div className="glass-card px-4 py-2.5 flex items-center gap-2 text-xs">
            <span className="text-gray-500">Ďalej:</span>
            <span className="text-lg leading-none">{ex.icon}</span>
            <span className="text-gray-400">
              {ex.name} — {sidesCount > 1
                ? `${sideLabel(ex, nextSideNo).toLowerCase()}${setsCount > 1 ? `, séria ${nextSetNo} z ${setsCount}` : ""}`
                : `séria ${nextSetNo} z ${setsCount}`}
            </span>
          </div>
        ) : idx < list.length - 1 ? (
          <div className="glass-card px-4 py-2.5 flex items-center gap-2 text-xs">
            <span className="text-gray-500">Ďalší cvik:</span>
            <span className="text-lg leading-none">{list[idx + 1].icon}</span>
            <span className="text-gray-400">{list[idx + 1].name}</span>
          </div>
        ) : null}
      </div>
    );
  }

  // ── Režim prehliadania ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 pt-4 pb-32">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          className="bg-white/5 border border-white/10 text-gray-400 hover:text-white p-2 rounded-xl transition-colors"
          aria-label="Späť na prehľad"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{meta.title}</h1>
          <p className="text-gray-400 text-sm">{meta.subtitle}</p>
        </div>
      </header>

      {/* Prepínač fáz */}
      <div className="flex bg-white/5 rounded-xl p-1 gap-1">
        {(["before", "after", "strength"] as WarmupPhase[]).map((p) => (
          <button
            key={p}
            onClick={() => switchPhase(p)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              phase === p ? "bg-primary/20 text-primary" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {p === "before" ? "Pred behom" : p === "after" ? "Po behu" : "Silový deň"}
          </button>
        ))}
      </div>

      {/* Krátky kontext k fáze */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex gap-3">
        <Sparkles size={18} className="text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-gray-300 leading-relaxed">
          {phase === "before" ? (
            <>Dynamická rozcvička <b className="text-gray-100">prebudí svaly a nervový systém</b> —
            na rozdiel od statického naťahovania pred behom nezníži výkon. Prvé cviky rob na mieste;
            druhú polovicu (skiping, vysoké kolená, rovinky…) rob v pohybe na ~30 m úseku.
            Patrí <b className="text-gray-100">len ku kľúčovým tréningom</b> — Speed (rýchlostné
            intervaly), Strength (silové dlhé intervaly) a Tempo (beh presne v cieľovom pretekovom
            tempe, HMP). Pred ľahký a dlhý beh ju netreba; tam stačí prvý kilometer odbehnúť pomaly.</>
          ) : phase === "after" ? (
            <>Po behu sú svaly teplé — ideálny čas na <b className="text-gray-100">statický strečing</b>.
            Každý ťah drž <b className="text-gray-100">plynule bez hojdania</b> a nikdy nenaťahuj
            do ostrej bolesti. Hanson strečing po behu odporúča, ale konkrétne cviky nepredpisuje.</>
          ) : (
            <>Doplnková <b className="text-gray-100">sila a stabilita</b> (core, zadok, jednonohé cviky) —
            rob ju na <b className="text-gray-100">ľahký alebo voľný deň</b>, nie pred kľúčovým behom.
            Nemá byť tvrdá; cieľom je odolnejšie telo, lepšia technika a menej zranení. Pokojne 1–2× týždenne.</>
          )}
        </p>
      </div>

      {/* Rovnaké slovo, dva rôzne významy — bez vysvetlenia to nového užívateľa mätie */}
      {phase === "before" && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex gap-3">
          <Info size={16} className="text-gray-400 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-400 leading-relaxed">
            <b className="text-gray-200">Pozor na názvoslovie:</b> v sekcii Plán je „Rozcvička“
            krok tréningu — 2–4 km voľného rozklusania. Tu ide o <b className="text-gray-200">sadu
            cvikov</b>, ktorú robíš až po tom rozklusaní, tesne pred hlavnou časťou tréningu.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{list.length} cvikov · {meta.mins}</span>
        <button
          onClick={startGuided}
          className="inline-flex items-center gap-2 bg-primary/15 border border-primary/30 text-primary text-xs font-bold px-3 py-2 rounded-xl hover:bg-primary/25 transition-colors"
        >
          <Play size={14} /> Spustiť krok za krokom
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {list.map((e, i) => (
          <ExerciseCard key={e.id} ex={e} idx={i} />
        ))}
      </div>

      <button
        onClick={startGuided}
        className="glass-card p-4 flex items-center justify-center gap-2 text-sm font-bold text-primary hover:bg-white/5 transition-colors"
      >
        <ListChecks size={18} /> Previesť ma cvikmi krok za krokom
      </button>
    </div>
  );
}

// MotionConfig rešpektuje systémové „obmedziť pohyb" (prefers-reduced-motion),
// takže animácie sa vypnú tomu, kto ich má zakázané.
export default function Warmup() {
  return (
    <MotionConfig reducedMotion="user">
      <WarmupScreen />
    </MotionConfig>
  );
}
