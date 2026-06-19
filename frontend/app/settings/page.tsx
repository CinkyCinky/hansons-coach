"use client";

import { useState, useEffect } from "react";
import { LogOut, Save, Loader2, Calendar, Target, Wifi, User, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { fetchProfile, updateProfile } from "@/lib/api";
import { useStore } from "@/lib/store";

function validateTargetTime(val: string): boolean {
  return /^\d{1,2}:\d{2}:\d{2}$/.test(val.trim());
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
  const [aiContext, setAiContext] = useState("");
  // Vlastný začiatok prípravy (override automatického výpočtu race - 18 týždňov)
  const [customStart, setCustomStart] = useState(false);

  // Informácia o časovej osi prípravy
  const [raceDateWarning, setRaceDateWarning] = useState<string | null>(null);

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
        <div className="glass-card p-4 flex flex-col gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-2 block">
              Tu vidíš, čo o tebe AI Tréner vie. Zohľadní to pri každom plánovaní a konverzácii.
            </label>
            <textarea
              value={aiContext}
              onChange={(e) => setAiContext(e.target.value)}
              className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 min-h-[120px] text-sm"
              placeholder="Napr.: Behávam večer. Mám Garmin 265S. Stredy nebehávam."
            />
            <p className="text-xs text-emerald-500/70 mt-2 ml-1">
              Tip: Tréner si sem bude automaticky dopisovať nové dôležité fakty, ktoré mu povieš v chate!
            </p>
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
        <p>Hansons Running Coach v2.0.0</p>
      </div>
    </div>
  );
}
