"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, Send, Calendar as CalIcon, Bot, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { generatePlan, uploadPlan } from "@/lib/api";

export default function Generator() {
  const [days, setDays] = useState({
    Po: true, Ut: true, St: true, Št: true, Pi: true, So: true, Ne: true
  });
  const [message, setMessage] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const availableDays = Object.entries(days).filter(([_, v]) => v).map(([k]) => k).join(", ");
      const constraints = `Dostupné dni na beh: ${availableDays}. Ďalšie požiadavky od zverenca: ${message || "Žiadne"}.`;
      
      const plan = await generatePlan(constraints);
      setGeneratedPlan(plan);
    } catch (err: any) {
      setError(err.message || "Nepodarilo sa vygenerovať plán.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    setUploading(true);
    setError(null);
    try {
      await uploadPlan(generatedPlan);
      setUploadSuccess(true);
    } catch (err: any) {
      setError(err.message || "Chyba pri nahrávaní do Garminu.");
    } finally {
      setUploading(false);
    }
  };

  const toggleDay = (d: keyof typeof days) => {
    setDays(prev => ({ ...prev, [d]: !prev[d] }));
  };

  return (
    <div className="flex flex-col gap-6 pt-4 pb-24">
      <header className="flex items-center gap-3">
        <Link href="/plan">
          <ArrowLeft className="text-gray-400 hover:text-white" />
        </Link>
        <h1 className="text-2xl font-bold">Generátor tréningov</h1>
      </header>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm font-bold break-words">
          Chyba: {error}
        </div>
      )}

      {uploadSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-sm font-bold flex items-center gap-2">
          <CheckCircle2 /> Plán bol úspešne nahratý a naplánovaný v tvojom Garmin kalendári!
        </div>
      )}

      {!generatedPlan && !loading && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
          <div className="glass-card p-5">
            <h3 className="font-bold mb-3 flex items-center gap-2"><CalIcon size={18} className="text-primary"/> 1. Dostupné dni na beh</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(days).map(([day, isSelected]) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day as keyof typeof days)}
                  className={`w-12 h-12 rounded-xl font-bold transition-colors ${
                    isSelected ? "bg-primary text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]" : "bg-white/5 text-gray-500 border border-white/10"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">Odklikni dni, kedy nemôžeš behať.</p>
          </div>

          <div className="glass-card p-5">
            <h3 className="font-bold mb-3 flex items-center gap-2"><Bot size={18} className="text-primary"/> 2. Inštrukcie pre trénera</h3>
            <textarea 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Napr. V utorok hrám tenis 2 hodiny, v piatok ma bolí koleno, takže chcem len výklus."
              className="w-full bg-[#1a1a24] border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors resize-none h-32"
            />
          </div>

          <button 
            onClick={handleGenerate}
            className="bg-primary hover:bg-blue-600 text-white font-bold py-4 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all flex items-center justify-center gap-2"
          >
            <Send size={18} /> Vygenerovať plán
          </button>
        </motion.div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-primary" size={48} />
          <p className="text-gray-400 mt-4 font-bold text-center">Tréner študuje tvoje dáta<br/>a navrhuje tréningy...</p>
        </div>
      )}

      {generatedPlan && !loading && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl">
            <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-2">Správa od trénera</h3>
            <p className="text-sm text-gray-200">{generatedPlan.coach_message}</p>
          </div>

          <div>
            <h3 className="font-bold mb-3 text-lg">Návrh plánu (7 dní)</h3>
            <div className="flex flex-col gap-3">
              {generatedPlan.workouts.map((w: any, idx: number) => (
                <div key={idx} className="glass-card p-4 rounded-xl border border-white/5">
                  <h4 className="font-bold text-primary mb-1">{w.workout_name}</h4>
                  <p className="text-xs text-gray-400 mb-3">{w.description}</p>
                  <div className="flex flex-col gap-2">
                    {w.steps.map((s: any, s_idx: number) => (
                      <div key={s_idx} className="flex justify-between items-center text-xs bg-white/5 p-2 rounded-lg">
                        <span className="uppercase font-bold text-gray-300">{s.type}</span>
                        <span>{s.distance_km} km</span>
                        <span className="text-emerald-400">{s.pace_max} - {s.pace_min} /km</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={() => setGeneratedPlan(null)}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-all"
            >
              Zrušiť
            </button>
            <button 
              onClick={handleUpload}
              disabled={uploading || uploadSuccess}
              className="flex-[2] bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all flex justify-center items-center gap-2"
            >
              {uploading && <Loader2 className="animate-spin" size={18} />}
              {uploadSuccess ? "Nahraté" : "Schváliť a zapísať do Garminu"}
            </button>
          </div>
        </motion.div>
      )}

    </div>
  );
}
