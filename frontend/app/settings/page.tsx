"use client";

import { useState, useEffect } from "react";
import { User, Target, Bell, LogOut, Cloud, Save, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { fetchProfile, updateProfile } from "@/lib/api";

export default function Settings() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [targetTime, setTargetTime] = useState("1:50:00");

  useEffect(() => {
    fetchProfile().then(profile => {
      if (profile.garmin_email) setEmail(profile.garmin_email);
      if (profile.target_time) setTargetTime(profile.target_time);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await updateProfile({
        garmin_email: email,
        garmin_password: password || undefined,
        target_time: targetTime
      });
      setMessage("Profil úspešne uložený!");
      setPassword(""); // Clear password field after save
    } catch (err) {
      setMessage("Chyba pri ukladaní profilu.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
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
    <div className="flex flex-col gap-6 pt-4 pb-24">
      <div className="mb-2">
        <h1 className="text-2xl font-bold">Nastavenia</h1>
        <p className="text-gray-400 text-sm">Spravuj svoj profil a ciele</p>
      </div>

      <section>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 ml-1">Garmin Účet</h3>
        <div className="glass-card p-4 flex flex-col gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Prihlasovací e-mail</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary/50"
              placeholder="napr. janko@gmail.com"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Heslo (vyplň len ak ho meníš)</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary/50"
              placeholder="••••••••"
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 ml-1">Tréningový Plán</h3>
        <div className="glass-card p-4 flex flex-col gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Cieľový čas polmaratónu</label>
            <input 
              type="text" 
              value={targetTime}
              onChange={e => setTargetTime(e.target.value)}
              className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary/50"
              placeholder="napr. 1:50:00"
            />
          </div>
        </div>
      </section>

      {message && <p className={`text-sm font-bold text-center ${message.includes('Chyba') ? 'text-rose-400' : 'text-emerald-400'}`}>{message}</p>}

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
        className="w-full py-4 text-rose-400 font-bold flex justify-center items-center gap-2 mt-4"
      >
        <LogOut size={18} />
        Odhlásiť sa z aplikácie
      </button>

      <div className="text-center mt-8 text-xs text-gray-600">
        <p>Hansons Running Coach v1.0.0 (SaaS)</p>
        <p>Postavené s Antigravity AI</p>
      </div>
    </div>
  );
}
