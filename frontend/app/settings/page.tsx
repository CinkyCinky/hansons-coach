"use client";

import { useState, useEffect } from "react";
import { LogOut, Save, Loader2, Calendar, Target, Wifi, User, AlertCircle, Plus, X, Sparkles } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { fetchProfile, updateProfile, fetchMemory, addMemoryFact, deleteMemoryFact, estimateGoal } from "@/lib/api";
import { useStore } from "@/lib/store";
import { computePaces } from "@/lib/paces";

function validateTargetTime(val: string): boolean {
  return /^\d{1,2}:\d{2}:\d{2}$/.test(val.trim());
}

function parseTimeSec(t: string): number | null {
  const p = String(t).split(":").map(Number);
  if (p.some(isNaN)) return null;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return null;
}

export default function Settings() {
  const supabase = createClient();
  const router = useRouter();
  const store = useStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [targetTime, setTargetTime] = useState("1:50:00");
  const [trainingStart, setTrainingStart] = useState("2026-06-01");
  const [raceDate, setRaceDate] = useState("");
  const [planVariant, setPlanVariant] = useState("advanced");
  const [aiContext, setAiContext] = useState("");
  // Vlastný začiatok prípravy (override automatického výpočtu race - 18 týždňov)
  const [customStart, setCustomStart] = useState(false);

  // Štruktúrovaná pamäť trénera (fakty)
  const [facts, setFacts] = useState<any[]>([]);
  const [newFact, setNewFact] = useState("");
  const [factBusy, setFactBusy] = useState(false);

  // Informácia o časovej osi prípravy
  const [raceDateWarning, setRaceDateWarning] = useState<string | null>(null);

  // Odhad cieľa (z VO2max alebo nedávnych pretekov)
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<{ predicted: string | null; source?: string; message?: string } | null>(null);
  const [showRaceInput, setShowRaceInput] = useState(false);
  const [raceDist, setRaceDist] = useState("10");
  const [raceTime, setRaceTime] = useState("");
  // Proaktívna re-kalibrácia cieľa: odhad z VO2max porovnaný s aktuálnym cieľom
  const [autoEst, setAutoEst] = useState<string | null>(null);

  const handleEstimate = async (useRace: boolean) => {
    setEstimating(true);
    setEstimate(null);
    try {
      const r = useRace
        ? await estimateGoal(parseFloat(raceDist) || undefined, raceTime || undefined)
        : await estimateGoal();
      setEstimate(r);
    } catch (e: any) {
      setEstimate({ predicted: null, message: e?.message || "Odhad zlyhal." });
    } finally {
      setEstimating(false);
    }
  };

  const DAY = 1000 * 60 * 60 * 24;
  const midnight = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  // Oficiálny Hanson začiatok = preteky - 18 týždňov (126 dní)
  const officialStartIso = (raceIso: string) => {
    const s = new Date(raceIso);
    s.setDate(s.getDate() - 126);
    return s.toISOString().split("T")[0];
  };

  // Auto-výpočet začiatku z dátumu pretekov (ak používateľ nemá vlastný)
  useEffect(() => {
    if (!raceDate || customStart) return;
    const auto = officialStartIso(raceDate);
    setTrainingStart((prev) => (prev === auto ? prev : auto));
  }, [raceDate, customStart]);

  // Vysvetľujúca správa o časovej osi prípravy
  useEffect(() => {
    if (!raceDate) {
      setRaceDateWarning(null);
      return;
    }
    const today = midnight(new Date());
    const race = midnight(new Date(raceDate));
    if (race <= today) {
      setRaceDateWarning("⚠️ Dátum pretekov je v minulosti. Zadaj budúci termín pretekov.");
      return;
    }

    const effStart = customStart && trainingStart ? midnight(new Date(trainingStart)) : midnight(new Date(officialStartIso(raceDate)));
    const achievableStart = effStart < today ? today : effStart; // trénovať v minulosti sa nedá
    const prepWeeks = Math.max(0, Math.round((race.getTime() - achievableStart.getTime()) / (DAY * 7)));
    const fmt = (d: Date) => d.toLocaleDateString("sk-SK");

    let msg: string;
    if (prepWeeks >= 19) {
      msg = `🌱 Začiatok ${fmt(effStart)} — máš ${prepWeeks} týždňov prípravy (Hanson ideál je 18). Začneš pokojnejšie: prvé týždne budú ľahšie a objem porastie postupne.`;
    } else if (prepWeeks >= 16) {
      msg = `✅ Začiatok ${fmt(effStart)} — ${prepWeeks} týždňov prípravy. Presne sedí na štandardný 18-týždňový Hanson plán.`;
    } else if (prepWeeks >= 10) {
      msg = `⏱️ Začiatok ${fmt(achievableStart)} — do pretekov máš len ${prepWeeks} týždňov (Hanson ideál je 18). Musíme zabrať: AI tréner plán zhustí a vynechá najľahšiu úvodnú fázu.`;
    } else if (prepWeeks >= 4) {
      msg = `⚠️ Pozor: ostáva len ${prepWeeks} týždňov prípravy. To je málo — plán bude náročný a krátený. Zváž, či nie je lepší neskorší termín pretekov.`;
    } else {
      msg = `🚫 Na poctivú Hanson prípravu je už neskoro (ostáva ~${prepWeeks} týž.). Odporúčam vybrať neskoršie preteky, alebo ber tieto bez tlaku na čas — ako tréningové.`;
    }
    if (customStart && effStart < today) {
      msg += " (Tvoj zadaný začiatok je v minulosti — počítame, že časť prípravy už máš za sebou.)";
    }
    setRaceDateWarning(msg);
  }, [raceDate, customStart, trainingStart]);

  useEffect(() => {
    fetchProfile()
      .then((profile) => {
        if (profile.display_name) setDisplayName(profile.display_name);
        if (profile.garmin_email) setEmail(profile.garmin_email);
        if (profile.target_time) setTargetTime(profile.target_time);
        if (profile.plan_variant) setPlanVariant(profile.plan_variant);
        if (profile.training_start_date) setTrainingStart(profile.training_start_date);
        if (profile.race_date) setRaceDate(profile.race_date);
        if (profile.ai_context) setAiContext(profile.ai_context);
        // Ak uložený začiatok nezodpovedá automatickému (race - 18 týž.), je to vlastný začiatok
        if (profile.race_date && profile.training_start_date) {
          const auto = officialStartIso(profile.race_date);
          if (profile.training_start_date !== auto) setCustomStart(true);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Načítaj štruktúrované fakty pamäte
  useEffect(() => {
    fetchMemory()
      .then((d) => setFacts(d.facts || []))
      .catch(() => {});
  }, []);

  // Proaktívna re-kalibrácia: odhad z Garmin VO2max (na porovnanie s cieľom)
  useEffect(() => {
    estimateGoal()
      .then((r) => { if (r?.predicted) setAutoEst(r.predicted); })
      .catch(() => {});
  }, []);

  const handleAddFact = async () => {
    const content = newFact.trim();
    if (!content || factBusy) return;
    setFactBusy(true);
    try {
      const res = await addMemoryFact(content);
      if (res?.fact) setFacts((f) => [...f, res.fact]);
      setNewFact("");
    } catch {
      // ignoruj — tabuľka môže ešte chýbať
    } finally {
      setFactBusy(false);
    }
  };

  const handleDeleteFact = async (id: string) => {
    setFacts((f) => f.filter((x) => x.id !== id)); // optimisticky
    try {
      await deleteMemoryFact(id);
    } catch {}
  };

  const handleSave = async () => {
    // Validácia formátu cieľového času
    if (targetTime && !validateTargetTime(targetTime)) {
      setMessage("Chyba: Cieľový čas musí byť vo formáte HH:MM:SS (napr. 1:50:00)");
      return;
    }

    // Dátum pretekov nesmie byť v minulosti
    if (raceDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const race = new Date(raceDate);
      race.setHours(0, 0, 0, 0);
      if (race <= today) {
        setMessage("Chyba: Dátum pretekov musí byť v budúcnosti.");
        return;
      }
    }

    setSaving(true);
    setMessage("");
    try {
      await updateProfile({
        display_name: displayName || undefined,
        garmin_email: email,
        garmin_password: password || undefined,
        target_time: targetTime,
        training_start_date: trainingStart,
        race_date: raceDate || undefined,
        ai_context: aiContext || undefined,
        plan_variant: planVariant,
      });
      // Invalidate store — nové profil dáta ovplyvnia výpočty
      store.invalidateAll();
      setMessage("Profil úspešne uložený! 🎉");
      setPassword("");
    } catch (err: any) {
      console.error(err);
      setMessage(`Chyba: ${err.message || "Neznáma chyba"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    // Potvrdenie pred odhlásením
    const confirmed = window.confirm("Naozaj sa chceš odhlásiť?");
    if (!confirmed) return;
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pt-4 pb-32">
      <div className="mb-2">
        <h1 className="text-2xl font-bold">Nastavenia</h1>
        <p className="text-gray-400 text-sm">Spravuj svoj profil a ciele</p>
      </div>

      {/* Osobný profil */}
      <section>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 ml-1 flex items-center gap-1">
          <User size={12} /> Osobný profil
        </h3>
        <div className="glass-card p-4 flex flex-col gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Meno / Prezývka</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary/50"
              placeholder="napr. Maroš"
            />
            <p className="text-xs text-gray-600 mt-1 ml-1">
              Takto ťa bude volať AI Tréner v chate a na dashboarde.
            </p>
          </div>
        </div>
      </section>

      {/* Garmin účet */}
      <section>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 ml-1">
          Garmin Connect
        </h3>
        <div className="glass-card p-4 flex flex-col gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Prihlasovací e-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary/50"
              placeholder="napr. janko@gmail.com"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              Heslo <span className="text-gray-600">(vyplň len ak ho meníš)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary/50"
              placeholder="••••••••"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-black/20 p-3 rounded-xl">
            <Wifi size={14} className="text-emerald-400 shrink-0" />
            <span>Heslo je uložené šifrované. Garmin session sa automaticky obnovuje.</span>
          </div>
        </div>
      </section>

      {/* Tréningový plán */}
      <section>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 ml-1">
          Tréningový Plán
        </h3>
        <div className="glass-card p-4 flex flex-col gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block flex items-center gap-1">
              <Target size={12} /> Cieľový čas polmaratónu
            </label>
            <input
              type="text"
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
              className={`w-full bg-[#1a1a24] border rounded-xl px-4 py-2 text-white focus:outline-none transition-colors ${
                targetTime && !validateTargetTime(targetTime)
                  ? "border-rose-500/50 focus:border-rose-500"
                  : "border-white/10 focus:border-primary/50"
              }`}
              placeholder="napr. 1:50:00"
            />
            {targetTime && !validateTargetTime(targetTime) && (
              <p className="text-xs text-rose-400 mt-1 ml-1">Formát musí byť HH:MM:SS (napr. 1:50:00)</p>
            )}
            <p className="text-xs text-gray-500 mt-2 ml-1 leading-snug">
              💡 {planVariant === "just_finish"
                ? <>Z tohto času sa počíta tvoje <b className="text-gray-300">Easy</b> tempo (a slúži ako očakávané tempo dobehnutia)</>
                : <>Z tohto času sa počítajú <b className="text-gray-300">všetky</b> tréningové tempá</>} —
              zvoľ ho realisticky podľa nedávnej formy (napr. z posledných pretekov), nie ako zbožné
              prianie. Prehnaný cieľ spraví každý tréning prirýchly (najčastejšia chyba). Neistý?{" "}
              <Link href="/about" className="text-primary underline underline-offset-2">Pozri „O metóde"</Link>.
            </p>

            {/* Tempová kalkulačka — naživo z cieľového času (zrkadlí backend) */}
            {validateTargetTime(targetTime) && (() => {
              const p = computePaces(targetTime);
              if (!p) return null;
              const isJF = planVariant === "just_finish";
              return (
                <div className="mt-3 bg-black/20 border border-white/10 rounded-xl p-3">
                  <p className="text-[11px] font-bold text-gray-300 mb-2">
                    {isJF ? "Tvoje tempo pri tomto cieli" : "Tvoje tréningové tempá pri tomto cieli"}
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-gray-400">Easy / Dlhé</span>
                    <span className="text-right font-mono text-emerald-300">{p.easyMin}–{p.easyMax}/km</span>
                    {isJF ? (
                      <>
                        <span className="text-gray-400">Tempo dobehnutia (ref.)</span>
                        <span className="text-right font-mono text-gray-400">~{p.tempo}/km</span>
                      </>
                    ) : (
                      <>
                        <span className="text-gray-400">Tempo (pretekové, HMP)</span>
                        <span className="text-right font-mono text-amber-300">{p.tempo}/km</span>
                        <span className="text-gray-400">Strength</span>
                        <span className="text-right font-mono text-orange-300">{p.strength}/km</span>
                        <span className="text-gray-400">Speed (5K)</span>
                        <span className="text-right font-mono text-rose-300">~{p.speedApprox}/km</span>
                      </>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-600 mt-2 leading-relaxed">
                    {isJF
                      ? "Just Finish sa beží celý v Easy tempe — intervaly ani tempo nie sú. „Tempo dobehnutia“ je len orientačná referencia, ktorá kotví Easy pásmo."
                      : <>Tempo, Easy a Strength sa počítajú priamo z cieľa. <b className="text-gray-500">Speed</b> je len orientačný — reálne sa určí z tvojej aktuálnej formy (Garmin VO2max), preto použi „Odhadnúť z mojej formy" nižšie.</>}
                  </p>
                </div>
              );
            })()}

            {/* Re-kalibrácia: forma (VO2max) vs aktuálny cieľ */}
            {(() => {
              const goalSec = parseTimeSec(targetTime);
              const estSec = autoEst ? parseTimeSec(autoEst) : null;
              const diff = goalSec && estSec ? Math.round((goalSec - estSec) / 60) : null;
              if (diff == null || Math.abs(diff) < 4) return null;
              return (
                <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs">
                  <p className="text-amber-300 font-bold mb-1">Forma vs cieľ</p>
                  <p className="text-gray-300 leading-snug">
                    Tvoja aktuálna forma napovedá ~<b className="text-gray-100">{autoEst}</b>{" "}
                    {diff < 0
                      ? `— tvoj cieľ je o ${Math.abs(diff)} min rýchlejší. Zváž miernejší cieľ, nech tempá nie sú prirýchle.`
                      : `— tvoj cieľ je o ${diff} min pomalší. Ak sa cítiš dobre, zváž ambicióznejší cieľ.`}
                  </p>
                  <button
                    type="button"
                    onClick={() => setTargetTime(autoEst!)}
                    className="mt-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 font-bold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Použiť ~{autoEst}
                  </button>
                </div>
              );
            })()}

            {/* Odhad realistického cieľa */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleEstimate(false)}
                disabled={estimating}
                className="inline-flex items-center gap-1.5 bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary text-xs font-bold px-3 py-2 rounded-xl transition-colors disabled:opacity-60"
              >
                {estimating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Odhadnúť z mojej formy
              </button>
              <button
                type="button"
                onClick={() => setShowRaceInput((v) => !v)}
                className="text-xs text-gray-400 hover:text-white underline underline-offset-2 px-1"
              >
                alebo z nedávnych pretekov
              </button>
            </div>

            {showRaceInput && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="number" step="0.1" inputMode="decimal" value={raceDist}
                  onChange={(e) => setRaceDist(e.target.value)}
                  className="w-16 bg-[#1a1a24] border border-white/10 rounded px-2 py-1.5 text-white text-center focus:outline-none focus:border-primary/50"
                />
                <span className="text-gray-500">km za</span>
                <input
                  type="text" inputMode="numeric" value={raceTime} placeholder="48:00"
                  onChange={(e) => setRaceTime(e.target.value)}
                  className="w-20 bg-[#1a1a24] border border-white/10 rounded px-2 py-1.5 text-white text-center focus:outline-none focus:border-primary/50"
                />
                <button
                  type="button"
                  onClick={() => handleEstimate(true)}
                  disabled={estimating || !raceTime}
                  className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                >
                  Odhadnúť
                </button>
              </div>
            )}

            {estimate && (
              <div className="mt-2 bg-black/20 border border-white/10 rounded-xl p-3 text-xs">
                {estimate.predicted ? (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-gray-300">
                        Odhadovaný polmaratón: <b className="text-primary text-sm">{estimate.predicted}</b>
                      </p>
                      {estimate.source && <p className="text-[11px] text-gray-500 mt-0.5">{estimate.source}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setTargetTime(estimate.predicted!); setEstimate(null); }}
                      className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary font-bold px-3 py-1.5 rounded-lg transition-colors shrink-0"
                    >
                      Použiť tento čas
                    </button>
                  </div>
                ) : (
                  <p className="text-amber-400">{estimate.message || "Nepodarilo sa odhadnúť."}</p>
                )}
                <p className="text-[10px] text-gray-600 mt-2">
                  Odhad je orientačný — uprav podľa skúseností a trate. Radšej mierne konzervatívny cieľ.
                </p>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-2 block">Variant Hanson plánu</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "beginner", label: "Beginner", desc: "~77 km/týž vrchol" },
                { key: "advanced", label: "Advanced", desc: "~82 km/týž vrchol" },
                { key: "just_finish", label: "Just Finish", desc: "bez intervalov" },
              ].map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setPlanVariant(v.key)}
                  className={`rounded-xl px-2 py-2.5 text-center border transition-colors ${
                    planVariant === v.key
                      ? "bg-primary/20 border-primary text-white"
                      : "bg-[#1a1a24] border-white/10 text-gray-400 hover:text-white"
                  }`}
                >
                  <span className="block text-xs font-bold">{v.label}</span>
                  <span className="block text-[10px] text-gray-500 mt-0.5">{v.desc}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-1 ml-1 leading-snug">
              SOS = „Something of Substance" — 3 tvrdé tréningy týždňa (intervaly, tempo, dlhý beh).
              <b className="text-gray-400"> Beginner</b> ak s polmaratónom začínaš — má úvodnú <b className="text-gray-400">base
              fázu</b> (prvých 5 týždňov len ľahké behy a dlhý beh, intervaly a tempo až od T6).
              <b className="text-gray-400"> Advanced</b> ak už máš polmaratón odbehnutý a chceš zlepšiť čas — kvalita
              od začiatku. <b className="text-gray-400">Just Finish</b> = cieľ len dobehnúť, bez tvrdých intervalov.
              Všetky predpokladajú, že už pravidelne behávaš (nie je to plán od nuly).
            </p>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block flex items-center gap-1">
              <Calendar size={12} /> Dátum pretekov (Deň D)
            </label>
            <input
              type="date"
              value={raceDate}
              onChange={(e) => setRaceDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary/50"
            />
          </div>

          {/* Varovanie / informácia o dátume */}
          {raceDateWarning && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300 leading-relaxed">{raceDateWarning}</p>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 mb-1 block flex items-center gap-1">
              <Calendar size={12} /> Začiatok prípravy {customStart ? "(vlastný)" : "(automaticky, −18 týždňov)"}
            </label>
            <input
              type="date"
              value={trainingStart}
              readOnly={!customStart}
              onChange={(e) => setTrainingStart(e.target.value)}
              className={`w-full border border-white/10 rounded-xl px-4 py-2 focus:outline-none ${
                customStart
                  ? "bg-[#1a1a24] text-white focus:border-primary/50"
                  : "bg-[#1a1a24]/50 text-gray-500 opacity-60"
              }`}
            />
            <label className="flex items-center gap-2 mt-2 ml-1 cursor-pointer">
              <input
                type="checkbox"
                checked={customStart}
                onChange={(e) => {
                  const on = e.target.checked;
                  setCustomStart(on);
                  if (!on && raceDate) setTrainingStart(officialStartIso(raceDate));
                }}
                className="accent-primary w-4 h-4"
              />
              <span className="text-xs text-gray-400">Chcem zadať vlastný začiatok prípravy</span>
            </label>
            <p className="text-xs text-gray-600 mt-1 ml-1">
              {customStart
                ? "AI tréner porovná tvoj začiatok s odporúčaným (18 týž. pred pretekmi) a podľa toho prispôsobí náročnosť plánu."
                : "Začiatok sa automaticky počíta ako 18 týždňov pred pretekmi. Aktuálny týždeň sa určí z tohto dátumu."}
            </p>
          </div>
        </div>
      </section>

      {/* Osobná AI Pamäť */}
      <section>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 ml-1 flex items-center gap-1">
           Osobný AI Profil a Pamäť
        </h3>
        <div className="glass-card p-4 flex flex-col gap-5">
          {/* Štruktúrované fakty */}
          <div>
            <label className="text-xs text-gray-400 mb-2 block">
              Čo o tebe AI Tréner vie. Fakty si dopisuje sám z chatu — môžeš ich pridať aj zmazať.
            </label>
            {facts.length > 0 ? (
              <div className="flex flex-col gap-2 mb-3">
                {facts.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-2 bg-[#1a1a24] border border-white/10 rounded-xl px-3 py-2"
                  >
                    <span className="text-sm text-gray-200">{f.content}</span>
                    <button
                      onClick={() => handleDeleteFact(f.id)}
                      className="text-gray-500 hover:text-rose-400 shrink-0"
                      aria-label="Zmazať fakt"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600 mb-3">
                Zatiaľ žiadne fakty. Tréner si ich začne pamätať z konverzácie.
              </p>
            )}
            <div className="flex gap-2">
              <input
                value={newFact}
                onChange={(e) => setNewFact(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddFact();
                }}
                placeholder="Pridať fakt (napr. Bolí ma ľavé koleno)"
                className="flex-1 bg-[#1a1a24] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
              />
              <button
                onClick={handleAddFact}
                disabled={!newFact.trim() || factBusy}
                className="bg-primary hover:bg-blue-600 disabled:opacity-40 text-white rounded-xl px-3 flex items-center justify-center"
                aria-label="Pridať fakt"
              >
                {factBusy ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
              </button>
            </div>
          </div>

          {/* Voľné poznámky (staršie, voliteľné) */}
          <div>
            <label className="text-xs text-gray-400 mb-2 block">Voľné poznámky (nepovinné)</label>
            <textarea
              value={aiContext}
              onChange={(e) => setAiContext(e.target.value)}
              className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 min-h-[90px] text-sm"
              placeholder="Napr.: Behávam večer. Mám Garmin 265S."
            />
            <p className="text-xs text-gray-600 mt-1 ml-1">Uloží sa tlačidlom „Uložiť profil" nižšie.</p>
          </div>
        </div>
      </section>

      {message && (
        <p
          className={`text-sm font-bold text-center ${
            message.includes("Chyba") ? "text-rose-400" : "text-emerald-400"
          }`}
        >
          {message}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] flex justify-center items-center gap-2"
      >
        {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
        {saving ? "Ukladám..." : "Uložiť profil"}
      </button>

      <button
        onClick={handleLogout}
        className="w-full py-4 text-rose-400 font-bold flex justify-center items-center gap-2 mt-2 hover:text-rose-300 transition-colors"
      >
        <LogOut size={18} />
        Odhlásiť sa z aplikácie
      </button>

      <div className="text-center mt-4 text-xs text-gray-600">
        <p>Hansons Coach v2.0.0</p>
      </div>
    </div>
  );
}
