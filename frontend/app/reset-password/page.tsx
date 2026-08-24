"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Flame, Loader2, KeyRound } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { translateAuthError } from "@/lib/authErrors";

const MIN_LEN = 8;

// „checking“ = overujeme odkaz z e-mailu, „form“ = môže si nastaviť heslo,
// „invalid“ = odkaz je neplatný/expirovaný, „done“ = hotovo.
type Stage = "checking" | "form" | "invalid" | "done";

export default function ResetPassword() {
  const router = useRouter();
  const supabase = createClient();

  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Odkaz z e-mailu obsahuje jednorazový kód. Supabase klient si ho pri štarte
  // často vymení sám (detectSessionInUrl), preto najprv skúšame hotovú session
  // a výmenu robíme len ako záložný krok.
  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const errDesc = url.searchParams.get("error_description") ?? hash.get("error_description");
      const errCode = url.searchParams.get("error_code") ?? hash.get("error_code");

      if (errDesc || errCode) {
        if (cancelled) return;
        setError(translateAuthError({ code: errCode ?? undefined, message: errDesc ?? undefined }).message);
        setStage("invalid");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setStage("form");
        return;
      }

      const code = url.searchParams.get("code");
      if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (!exErr) {
          setStage("form");
          return;
        }
        // Klient mohol kód medzitým spotrebovať sám — over, či session predsa nevznikla.
        const { data: retry } = await supabase.auth.getSession();
        if (cancelled) return;
        if (retry.session) {
          setStage("form");
          return;
        }
        setError(translateAuthError(exErr).message);
        setStage("invalid");
        return;
      }

      setError(
        "Táto stránka sa otvára odkazom z e-mailu na obnovu hesla. Vyžiadaj si ho na prihlasovacej obrazovke."
      );
      setStage("invalid");
    };

    verify().catch((err) => {
      if (cancelled) return;
      setError(translateAuthError(err).message);
      setStage("invalid");
    });

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_LEN) {
      setError(`Heslo musí mať aspoň ${MIN_LEN} znakov.`);
      return;
    }
    if (password !== confirm) {
      setError("Heslá sa nezhodujú — skontroluj oba riadky.");
      return;
    }

    setSaving(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) throw upErr;
      setStage("done");
      // Po zmene hesla je používateľ prihlásený — pusti ho rovno do appky.
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(translateAuthError(err).message);
    } finally {
      setSaving(false);
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

        <div className="bg-primary/15 text-primary w-14 h-14 rounded-2xl flex items-center justify-center mb-4">
          <KeyRound size={26} />
        </div>
        <h1 className="text-2xl font-bold mb-2 text-center">Nové heslo</h1>

        {stage === "checking" && (
          <p className="text-gray-400 text-sm mt-2 flex items-center gap-2">
            <Loader2 className="animate-spin" size={16} /> Overujem odkaz z e-mailu…
          </p>
        )}

        {stage === "invalid" && (
          <>
            <p className="text-xs text-rose-400 text-center leading-relaxed mt-2 mb-5">{error}</p>
            <Link
              href="/login"
              className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-colors text-center"
            >
              Späť na prihlásenie
            </Link>
          </>
        )}

        {stage === "done" && (
          <p className="text-sm text-emerald-400 text-center leading-relaxed mt-2">
            Heslo je zmenené. Prihlasujem ťa… 🎉
          </p>
        )}

        {stage === "form" && (
          <>
            <p className="text-gray-400 text-sm mb-5 text-center leading-relaxed">
              Zadaj si nové heslo — aspoň {MIN_LEN} znakov. Toto je heslo do appky, nie do Garminu.
            </p>
            <form onSubmit={handleSave} className="w-full flex flex-col gap-4">
              <input
                type="password"
                placeholder="Nové heslo"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors"
                required
              />
              <input
                type="password"
                placeholder="Nové heslo znova"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors"
                required
              />

              {error && (
                <p className="text-xs text-rose-400 text-center leading-relaxed" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] mt-2 flex justify-center items-center gap-2 disabled:opacity-60"
              >
                {saving && <Loader2 className="animate-spin" size={18} />}
                Uložiť nové heslo
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
