"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Footprints, BrainCircuit, Repeat, Gauge, CalendarRange, Rocket, ChevronRight, X,
} from "lucide-react";

// localStorage kľúč — pri zmene obsahu úvodu zvýš verziu, aby sa zobrazil znova.
const SEEN_KEY = "hansons_onboarding_v1";
// Event, ktorým sa dá úvod znova otvoriť (napr. z obrazovky "O metóde").
export const OPEN_ONBOARDING_EVENT = "hansons:open-onboarding";

export function openOnboarding() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_ONBOARDING_EVENT));
  }
}

interface Card {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const CARDS: Card[] = [
  {
    icon: <Footprints size={32} />,
    title: "Vitaj v tvojom tréneri",
    body:
      "Táto appka ťa prevedie prípravou na polmaratón podľa Hansonovej metódy — overeného " +
      "tréningového systému. Spojí ju s tvojimi reálnymi dátami z Garminu. Za minútu ti " +
      "vysvetlíme, ako to celé funguje.",
  },
  {
    icon: <BrainCircuit size={32} />,
    title: "Kumulovaná únava — jadro metódy",
    body:
      "Hanson ťa NEnechá pred každým tréningom úplne oddýchnuť. Trénuješ na mierne unavených " +
      "nohách, aby si si zvykol na pocit zo záveru pretekov. Preto je dôležitý objem a " +
      "pravidelnosť — nie jeden hrdinský tréning. Cítiť sa trochu unavený je zámer, nie chyba.",
  },
  {
    icon: <Repeat size={32} />,
    title: "3 kľúčové tréningy (SOS)",
    body:
      "Iba 3 dni v týždni sú náročné — Hanson ich volá SOS („Something of Substance“): " +
      "intervaly (utorok), tempo na pretekovom tempe (štvrtok) a dlhý beh (nedeľa). " +
      "Medzi nimi sú vždy ľahké behy alebo voľno — nikdy nie 2 tvrdé dni za sebou.",
  },
  {
    icon: <Gauge size={32} />,
    title: "Easy znamená naozaj POMALY",
    body:
      "Najčastejšia chyba začiatočníka: behať ľahké dni príliš rýchlo. Easy behy sú na " +
      "regeneráciu a budovanie vytrvalosti — majú byť pohodlné, „konverzačné“. Keď ich " +
      "preženieš, pokazíš si kľúčové tréningy. Pomaly je tu správne.",
  },
  {
    icon: <CalendarRange size={32} />,
    title: "18 týždňov v 4 fázach",
    body:
      "Plán má 18 týždňov: úvod (rozbeh) → Speed (rýchlosť) → Strength (sila na pretekové " +
      "tempo) → Taper (posledný týždeň oddych, aby si prišiel svieži). Appka vie, v ktorej " +
      "fáze si, a tréningy tomu prispôsobí.",
  },
  {
    icon: <Rocket size={32} />,
    title: "Ako začať",
    body:
      "Tento plán predpokladá, že už nejaký čas pravidelne behávaš (nie je to plán od nuly). " +
      "Začni takto: 1) prepoj Garmin v Nastaveniach, 2) nastav cieľový čas a dátum pretekov, " +
      "3) v Pláne si nechaj vygenerovať týždeň. Kedykoľvek si tento úvod otvoríš znova v sekcii „Metóda“.",
  },
];

export default function Onboarding() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setVisible(true);
    } catch {
      /* localStorage nedostupné — úvod jednoducho nezobrazíme */
    }
    const onOpen = () => { setStep(0); setVisible(true); };
    window.addEventListener(OPEN_ONBOARDING_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ONBOARDING_EVENT, onOpen);
  }, []);

  const finish = () => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
    setVisible(false);
  };

  const next = () => {
    if (step >= CARDS.length - 1) finish();
    else setStep((s) => s + 1);
  };

  const card = CARDS[step];
  const isLast = step === CARDS.length - 1;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-[#0a0a0f]/95 backdrop-blur-sm flex items-center justify-center p-5"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md">
            <div className="flex justify-end mb-2">
              <button
                onClick={finish}
                className="text-gray-500 hover:text-white text-xs font-bold flex items-center gap-1"
              >
                Preskočiť <X size={14} />
              </button>
            </div>

            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-card p-6 flex flex-col gap-4"
            >
              <div className="bg-primary/15 text-primary w-16 h-16 rounded-2xl flex items-center justify-center">
                {card.icon}
              </div>
              <h2 className="text-2xl font-bold">{card.title}</h2>
              <p className="text-gray-300 leading-relaxed text-[15px]">{card.body}</p>

              {/* Progress bodky */}
              <div className="flex gap-1.5 mt-2">
                {CARDS.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === step ? "w-6 bg-primary" : "w-1.5 bg-white/15"
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={next}
                className="mt-2 bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {isLast ? "Začať" : "Ďalej"} <ChevronRight size={18} />
              </button>
            </motion.div>

            <p className="text-center text-[11px] text-gray-600 mt-3">
              Krok {step + 1} z {CARDS.length}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
