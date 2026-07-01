"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Flame, Loader2 } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/");
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setError("Registrácia úspešná! Skontroluj si email pre potvrdenie, alebo sa skús prihlásiť ak máš automatické potvrdenie.");
        setIsLogin(true);
      }
    } catch (err: any) {
      setError(err.message || "Vyskytla sa chyba");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-100px)] px-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-8 w-full max-w-sm flex flex-col items-center relative overflow-hidden"
      >
        <div className="absolute -top-10 -right-10 opacity-10">
          <Flame size={150} />
        </div>

        <Flame size={48} className="text-primary mb-4" />
        <h1 className="text-2xl font-bold mb-2">Hansons Coach</h1>
        <p className="text-gray-400 text-sm mb-5 text-center leading-relaxed">
          Osobný AI tréner na polmaratón podľa Hansonovej metódy. Prepojí sa s tvojím
          Garminom a plán ti zostaví z tvojich reálnych dát.
        </p>
        <div className="w-full bg-white/5 border border-white/10 rounded-xl p-3 mb-6 text-[11px] text-gray-400 leading-relaxed">
          <b className="text-gray-300">Čo potrebuješ:</b> účet Garmin Connect (bežecké hodinky)
          a to, že už pravidelne behávaš — plán ťa pripraví na polmaratón, nie je to beh od nuly.
        </div>

        <form onSubmit={handleAuth} className="w-full flex flex-col gap-4">
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors"
              required
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Heslo"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors"
              required
            />
          </div>

          {error && (
            <p className={`text-xs font-bold text-center ${error.includes("úspešná") ? "text-emerald-400" : "text-rose-400"}`}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] mt-2 flex justify-center items-center gap-2"
          >
            {loading && <Loader2 className="animate-spin" size={18} />}
            {isLogin ? "Prihlásiť sa" : "Vytvoriť účet"}
          </button>
        </form>

        <button 
          onClick={() => setIsLogin(!isLogin)}
          className="text-xs text-gray-400 mt-6 hover:text-white transition-colors"
        >
          {isLogin ? "Nemáš účet? Zaregistruj sa" : "Už máš účet? Prihlás sa"}
        </button>
      </motion.div>
    </div>
  );
}
