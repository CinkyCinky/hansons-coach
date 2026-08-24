"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Flame, Loader2, ArrowLeft } from "lucide-react";
import { translateAuthError } from "@/lib/authErrors";

type Mode = "login" | "signup" | "forgot";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  // Chyba a potvrdenie sú oddelené stavy — predtým sa „úspech“ poznával podľa
  // toho, či hláška obsahuje slovo „úspešná“, čo bolo krehké.
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Účet existuje, ale e-mail nie je potvrdený → ponúkni znovuposlanie
  const [showResend, setShowResend] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const reset = () => {
    setError(null);
    setNotice(null);
    setShowResend(false);
  };

  const fail = (err: unknown) => {
    const info = translateAuthError(err);
    setError(info.message);
    setShowResend(!!info.unconfirmed);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    reset();

    try {
      if (mode === "forgot") {
        // Supabase pošle e-mail s odkazom na /reset-password, kde si používateľ
        // nastaví nové heslo. Odpovedáme rovnako aj keď účet neexistuje — aby sa
        // cez formulár nedalo zisťovať, ktoré e-maily sú zaregistrované.
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setNotice(
          "Ak na tento e-mail existuje účet, poslali sme naň odkaz na nastavenie nového hesla. " +
            "Skontroluj si schránku aj priečinok Spam — odkaz platí približne hodinu."
        );
        return;
      }

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        router.push("/");
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      // Ak má projekt vypnuté potvrdzovanie e-mailu, Supabase rovno vráti session
      // a používateľa netreba posielať do schránky.
      if (data.session) {
        router.push("/");
        router.refresh();
        return;
      }
      setMode("login");
      setNotice(
        "Účet je vytvorený. Poslali sme ti potvrdzovací e-mail — klikni v ňom na odkaz a potom sa prihlás."
      );
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    reset();
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
      if (error) throw error;
      setNotice("Potvrdzovací e-mail sme poslali znova. Skontroluj si schránku aj priečinok Spam.");
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === "forgot" ? "Obnova hesla" : mode === "signup" ? "Vytvoriť účet" : "Prihlásiť sa";

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

        {mode === "forgot" ? (
          <p className="text-gray-400 text-sm mb-5 text-center leading-relaxed">
            Zadaj e-mail, ktorým sa prihlasuješ. Pošleme ti naň odkaz na nastavenie nového hesla.
          </p>
        ) : (
          <>
            <p className="text-gray-400 text-sm mb-5 text-center leading-relaxed">
              Osobný AI tréner na polmaratón podľa Hansonovej metódy. Prepojí ťa s tvojím
              Garminom a plán ti zostaví z tvojich reálnych dát.
            </p>
            <div className="w-full bg-white/5 border border-white/10 rounded-xl p-3 mb-6 text-[11px] text-gray-400 leading-relaxed">
              <b className="text-gray-300">Čo potrebuješ:</b> účet Garmin Connect (bežecké hodinky)
              a to, že už pravidelne behávaš — plán ťa pripraví na polmaratón, nie je to beh od nuly.
            </div>
          </>
        )}

        <form onSubmit={handleAuth} className="w-full flex flex-col gap-4">
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors"
              required
            />
          </div>
          {mode !== "forgot" && (
            <div>
              <input
                type="password"
                placeholder="Heslo"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors"
                required
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-400 text-center leading-relaxed" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="text-xs text-emerald-400 text-center leading-relaxed" role="status">
              {notice}
            </p>
          )}

          {showResend && (
            <button
              type="button"
              onClick={handleResend}
              disabled={loading || !email.trim()}
              className="text-xs font-bold text-primary underline underline-offset-2 disabled:opacity-50"
            >
              Poslať potvrdzovací e-mail znova
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] mt-2 flex justify-center items-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 className="animate-spin" size={18} />}
            {mode === "forgot" ? "Poslať odkaz" : title}
          </button>
        </form>

        {mode === "forgot" ? (
          <button
            onClick={() => {
              setMode("login");
              reset();
            }}
            className="text-xs text-gray-400 mt-6 hover:text-white transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft size={13} /> Späť na prihlásenie
          </button>
        ) : (
          <div className="flex flex-col items-center gap-2 mt-6">
            <button
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                reset();
              }}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              {mode === "login" ? "Nemáš účet? Zaregistruj sa" : "Už máš účet? Prihlás sa"}
            </button>
            {mode === "login" && (
              <button
                onClick={() => {
                  setMode("forgot");
                  reset();
                }}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                Zabudol si heslo?
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
