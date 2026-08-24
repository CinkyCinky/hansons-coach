"use client";

import { useState, useEffect } from "react";
import { LogOut, Save, Loader2, Calendar, Target, Wifi, User, AlertCircle, Plus, X, Sparkles, CheckCircle2, Circle, RefreshCw, ShieldAlert, HelpCircle } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { fetchProfile, updateProfile, fetchMemory, addMemoryFact, deleteMemoryFact, estimateGoal, checkGarminConnection, errorStatus } from "@/lib/api";
import { useStore } from "@/lib/store";
import { computePaces } from "@/lib/paces";

// Slovenské skloňovanie: 1 týždeň, 2–4 týždne, 5+ týždňov. Bez toho vznikali vety
// ako „ostáva len 4 týždňov prípravy".
const weekWord = (n: number) => (n === 1 ? "týždeň" : n >= 2 && n <= 4 ? "týždne" : "týždňov");
// Sloveso sa musí zhodovať tiež: „ostávajú 4 týždne" vs „ostáva 5 týždňov".
const weeksLeft = (n: number) =>
  n >= 2 && n <= 4 ? `ostávajú len ${n} týždne` : `ostáva len ${n} ${weekWord(n)}`;

function validateTargetTime(val: string): boolean {
  return /^\d{1,2}:\d{2}:\d{2}$/.test(val.trim());
}

// Čitateľné názvy variantov plánu (na výzvu pri kontrolnom zozname)
const VARIANT_LABELS: Record<string, string> = {
  beginner: "Beginner",
  advanced: "Advanced",
  just_finish: "Just Finish",
};

// ── Sprievodca výberom variantu ───────────────────────────────────────────────
// Variant je rozhodnutie na celých 18 týždňov, ale zverenec pri ňom vidí len dve
// anglické slová a číslo objemu. Tri otázky ho k variantu dovedú podľa metodiky
// (docs kap. 1.2 a hansons_knowledge.VARIANTS), nie podľa toho, čo znie lepšie.
type WizardAnswers = {
  ranHalf: "yes" | "no" | null;   // 1. Bežal si už polmaratón?
  days: "0-2" | "3-4" | "5+" | null; // 2. Koľko dní v týždni teraz behávaš?
  goal: "time" | "finish" | null;  // 3. Čo je tvoj cieľ?
};

const EMPTY_WIZARD: WizardAnswers = { ranHalf: null, days: null, goal: null };

// Odpovede vyzerajú rovnako ako dlaždice výberu variantu, nech je jasné, že sa klikajú.
// Na mobile (~375 px) musia zniesť aj dva riadky textu, preto žiadna pevná výška.
const wizardBtn = (active: boolean) =>
  `rounded-xl px-2 py-2.5 text-center text-[11px] font-bold border transition-colors leading-snug ${
    active
      ? "bg-primary/20 border-primary text-white"
      : "bg-[#1a1a24] border-white/10 text-gray-400 hover:text-white"
  }`;

// Poradie podmienok je dôležité: najprv vyradíme prípady, kde by 6 behov týždenne
// a tvrdé intervaly boli priveľký skok (Just Finish), potom prípady bez skúsenosti
// alebo bez návyku 5+ behov (Beginner) a až zvyšok je Advanced.
function recommendVariant(a: WizardAnswers): { key: string; why: string } | null {
  if (!a.ranHalf || !a.days || !a.goal) return null; // kým nie sú všetky tri odpovede, neradíme
  if (a.goal === "finish") {
    return {
      key: "just_finish",
      why: "Ideš si po dobehnutie, nie po konkrétny čas — a Just Finish je celý v ľahkom (Easy) tempe bez tvrdých intervalov, takže ťa do cieľa dovedie s najmenším rizikom zranenia.",
    };
  }
  if (a.days === "0-2") {
    return {
      key: "just_finish",
      why: "Teraz behávaš 0 – 2 dni v týždni, no Hanson plány počítajú so šiestimi behmi týždenne, takže skočiť rovno do tvrdých tréningov by bolo priveľa — Just Finish (len ľahké behy a dlhý beh) ťa najprv bezpečne rozbehá.",
    };
  }
  if (a.ranHalf === "no") {
    return {
      key: "beginner",
      why: "Prvý polmaratón ťa ešte len čaká, a Beginner s tým ráta — prvých 5 týždňov je len rozbehanie (tzv. base fáza: ľahké behy a nedeľný dlhý beh) a tvrdé tréningy sa pridajú až od 6. týždňa.",
    };
  }
  if (a.days === "3-4") {
    return {
      key: "beginner",
      why: "Behávaš 3 – 4 dni v týždni, takže Beginner s nižším vrcholom objemu (~77 km za týždeň) je z tvojho terajšieho objemu podstatne bezpečnejší skok než Advanced (~82 km za týždeň).",
    };
  }
  return {
    key: "advanced",
    why: "Polmaratón už máš odbehnutý, behávaš 5 a viac dní v týždni a ideš si po konkrétny čas — Advanced ti preto dá kvalitné tréningy (intervaly aj tempové behy) hneď od 1. týždňa a najvyšší objem (~82 km za týždeň).",
  };
}

// ── Overenie prepojenia s Garminom ────────────────────────────────────────────
// Typ berieme priamo z api.ts, nech sa zoznam dôvodov nerozíde s tým, čo posiela backend.
type GarminCheckResult = Awaited<ReturnType<typeof checkGarminConnection>>;

// Hláška zo servera povie, ČO sa stalo. Tu dopĺňame, ČO S TÝM ROBIŤ — samotné
// „nesprávne heslo“ nováčikovi nepovie, že ho treba prepísať a znova uložiť.
const GARMIN_ADVICE: Record<string, string> = {
  credentials: "Skontroluj prihlasovací e-mail vyššie a heslo napíš nanovo do políčka „Heslo“ (appka si uložené heslo nevie prečítať, takže ho treba zadať celé). Potom klikni „Uložiť profil“ dole a over prepojenie znova.",
  mfa: "Na Garmin účte máš zapnuté dvojfaktorové overenie (2FA — okrem hesla pýta ešte jednorazový kód). Appka nemá kam ten kód zadať, takže ho treba v nastaveniach Garmin účtu (Account Settings → Sign-in & Security) dočasne vypnúť a overiť znova.",
  rate_limit: "Garmin dočasne odmieta ďalšie prihlásenia, lebo ich za sebou bolo priveľa. Počkaj asi 15 minút a skús to znova — na tvojich údajoch pravdepodobne nie je nič zlé.",
  missing: "Vyplň prihlasovací e-mail aj heslo vyššie a ulož ich tlačidlom „Uložiť profil“ dole — až potom má appka čím sa prihlásiť.",
  network: "Vyzerá to na výpadok na strane Garminu — appka sa k nemu teraz nedostala. Skús to o chvíľu znova.",
};

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
  // Zlyhanie načítania profilu musí byť vidieť: keby sme ho ticho prehltli, formulár by
  // ukázal defaulty a uložením by si zverenec prepísal cieľ a vymazal Garmin e-mail.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Naposledy uložený profil zo servera — z neho sa počíta kontrolný zoznam aj to,
  // či má užívateľ vo formulári neuložené zmeny.
  const [savedProfile, setSavedProfile] = useState<any | null>(null);

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
  // Vysvetlivky k anglickým názvom temp — nový zverenec netuší, čo je Strength či Speed
  const [showPaceLegend, setShowPaceLegend] = useState(false);

  // Sprievodca výberom variantu (3 otázky). Odpovede držíme aj po zavretí, nech sa
  // zverenec k odporúčaniu vie vrátiť bez toho, aby klikal všetko odznova.
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizard, setWizard] = useState<WizardAnswers>(EMPTY_WIZARD);

  // Overenie prepojenia s Garminom — tri stavy: prebieha / výsledok zo servera /
  // volanie samotné zlyhalo (sieť). Bez tretieho stavu by po výpadku ostalo
  // tlačidlo bez akejkoľvek odozvy a vyzeralo by to ako pokazená appka.
  const [garminChecking, setGarminChecking] = useState(false);
  const [garminCheck, setGarminCheck] = useState<GarminCheckResult | null>(null);
  const [garminCheckError, setGarminCheckError] = useState<string | null>(null);

  const handleGarminCheck = async () => {
    if (garminChecking) return;
    setGarminChecking(true);
    setGarminCheck(null);
    setGarminCheckError(null);
    try {
      const r = await checkGarminConnection();
      // Endpoint má vracať vždy HTTP 200 s `ok`. Keby prišlo niečo iné (proxy, stará
      // verzia backendu), nesmieme to ticho vyhodnotiť ako neúspešné prihlásenie.
      if (!r || typeof r.ok !== "boolean") throw new Error("Server vrátil odpoveď, ktorej appka nerozumie.");
      setGarminCheck(r);
    } catch (e: any) {
      // Surová výnimka („Failed to fetch“) zverencovi nepovie nič — preložíme ju.
      // Podľa HTTP stavu vieme rozlíšiť, či sme sa na server VÔBEC nedostali (žiadny stav),
      // alebo odpovedal chybou — rada „skontroluj internet“ by v druhom prípade bola nezmysel.
      const status = errorStatus(e);
      const detail = e?.message ? ` (detail: ${e.message})` : "";
      if (status === 401 || status === 403) {
        setGarminCheckError("Tvoje prihlásenie do appky vypršalo. Odhlás sa dole a prihlás sa znova, potom overenie zopakuj.");
      } else if (status) {
        setGarminCheckError(`Server odpovedal chybou (${status}), overenie sa nedokončilo. Skús to o chvíľu znova.${detail}`);
      } else {
        setGarminCheckError(
          `Overenie sa nepodarilo spustiť — appka sa nedostala na vlastný server. Skontroluj pripojenie na internet a skús to znova.${detail}`
        );
      }
    } finally {
      setGarminChecking(false);
    }
  };

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
  // Aktuálny týždeň prípravy — musí sedieť s backendom (hansons_knowledge.current_training_week):
  // T1 je kotvený na PONDELOK v deň štartu alebo prvý nasledujúci a týždeň sa mení vždy
  // v pondelok, nie po 7 dňoch od štartu. Výsledok je orezaný na 1–18 ako na backende.
  const trainingWeekOf = (start: Date, today: Date) => {
    const isoDow = (d: Date) => (d.getDay() + 6) % 7; // 0 = pondelok (rovnako ako v Pythone)
    const anchorMonday = new Date(start);
    anchorMonday.setDate(anchorMonday.getDate() + ((7 - isoDow(start)) % 7)); // pondelok ≥ štart
    const todayMonday = new Date(today);
    todayMonday.setDate(todayMonday.getDate() - isoDow(today)); // pondelok tohto týždňa
    // Zaokrúhľujeme, nie orezávame — medzi dvoma polnocami môže byť kvôli letnému času
    // o hodinu menej a celý týždeň by sa stratil.
    const week = Math.round((todayMonday.getTime() - anchorMonday.getTime()) / (DAY * 7)) + 1;
    return Math.min(18, Math.max(1, week));
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
    // Appka plán ani nepredlžuje, ani nezhusťuje: týždeň sa počíta dopredu od začiatku
    // prípravy a oreže sa na 18 — texty preto musia hovoriť o tomto, nie o prispôsobení.
    const startedInPast = effStart < today;
    const weekNow = trainingWeekOf(effStart, today);
    // Týždeň je orezaný na 1–18. Pri dávnom začiatku vyjde 18 — a to je vylaďovací
    // (taper) týždeň, teda najľahšia časť plánu, nie najtvrdšia. Naopak pri začiatku spred
    // pár dní vyjde 1 a nevynecháva sa nič. Texty musia rozlíšiť oba konce.
    const atTaper = weekNow >= 18;
    const skipsStart = startedInPast && weekNow > 1;

    let msg: string;
    // Povie už hlavná hláška, do ktorého týždňa appka zverenca zaradí? Ak áno, dodatok
    // na konci to nesmie zopakovať ešte raz.
    let msgSaysWeek = false;
    if (prepWeeks >= 19) {
      if (skipsStart) {
        // Začiatok v minulosti + veľa času do pretekov: plán sa nepredlžuje, zverenec
        // dobehne 18. týždeň dávno pred pretekmi a zostane na ňom.
        msg = atTaper
          ? `🌱 Tvoj začiatok ${fmt(effStart)} je tak dávno, že appka ťa už teraz drží na 18. (vylaďovacom, tzv. taper) týždni — a do pretekov máš ešte ${prepWeeks} ${weekWord(prepWeeks)}. Taper je zámerne najľahší a patrí až do posledného týždňa pred pretekmi, takže takto by si celý čas len udržiaval formu. Nastav si začiatok 18 týždňov pred pretekmi, nech ti plán vyjde načasovaný.`
          : `🌱 Tvoj začiatok ${fmt(effStart)} je v minulosti, takže appka ťa zaradí rovno do ${weekNow}. týždňa plánu — a do pretekov máš ešte ${prepWeeks} ${weekWord(prepWeeks)}. Hanson plán má pevných 18 a appka ho o týždne navyše nepredĺži: zvyšné týždne plánu prejdeš a posledných ~${Math.max(0, prepWeeks - (18 - weekNow))} týž. pred pretekmi zostaneš na 18. (vylaďovacom, tzv. taper) týždni — teda v najľahšej časti plánu. Lepšie je nastaviť začiatok 18 týždňov pred pretekmi, nech ti plán vyjde načasovaný.`;
        msgSaysWeek = true;
      } else {
        msg = `🌱 Začiatok ${fmt(effStart)} — do pretekov máš ${prepWeeks} týždňov, ale Hanson plán má pevných 18 a appka ho o týždne navyše nepredĺži. Prejdeš týždne 1–18 a posledné ~${prepWeeks - 18} týž. pred pretekmi zostaneš na 18. (vylaďovacom, tzv. taper) týždni — teda v najľahšej časti plánu. Lepšie je nechať automatický začiatok 18 týždňov pred pretekmi a čas navyše si odbehať vo vlastnom voľnom objeme.`;
      }
    } else if (prepWeeks >= 16) {
      msg = `✅ Začiatok ${fmt(effStart)} — ${prepWeeks} týždňov prípravy. Presne sedí na štandardný 18-týždňový Hanson plán.`;
    } else if (prepWeeks >= 10) {
      if (skipsStart) {
        msg = atTaper
          ? `⏱️ Do pretekov máš len ${prepWeeks} týždňov (Hanson ideál je 18) a tvoj začiatok je tak dávno, že appka ťa zaradí do 18. — posledného, vylaďovacieho (taper) týždňa. Ten je zámerne najľahší a patrí až do posledného týždňa pred pretekmi, takže takto by si ${prepWeeks} ${weekWord(prepWeeks)} len udržiaval formu. Posuň si začiatok prípravy bližšie k dnešku.`
          : `⏱️ Do pretekov máš len ${prepWeeks} týždňov (Hanson ideál je 18). Appka ťa preto zaradí rovno do ${weekNow}. týždňa plánu — úvodné najľahšie týždne vynecháš. Počítaj s tým, že objem aj tvrdé tréningy idú naplno hneď od začiatku.`;
        msgSaysWeek = true;
      } else {
        msg = `⏱️ Začiatok ${fmt(achievableStart)} — do pretekov máš len ${prepWeeks} týždňov (Hanson ideál je 18). Plán pobeží od 1. týždňa, takže do pretekov stihneš zhruba jeho prvých ${prepWeeks} týždňov z 18 — záverečné vylaďovanie (taper) ti vypadne. Ak ho chceš mať, nechaj automatický začiatok 18 týždňov pred pretekmi.`;
      }
    } else if (prepWeeks >= 4) {
      if (skipsStart) {
        msg = atTaper
          ? `⚠️ Pozor: ${weeksLeft(prepWeeks)} prípravy a tvoj začiatok je tak dávno, že appka ťa zaradí rovno do 18. — posledného, vylaďovacieho (taper) týždňa. Ten je zámerne najľahší (má ťa len oddýchnuť pred pretekmi), takže z Hanson prípravy by si takto reálne nič neodtrénoval. Posuň si začiatok prípravy bližšie k dnešku alebo zváž neskorší termín pretekov.`
          : `⚠️ Pozor: ${weeksLeft(prepWeeks)} prípravy. Appka ťa zaradí rovno do ${weekNow}. týždňa plánu, takže úvodný rozbeh vynecháš — objem aj tvrdé tréningy idú naplno hneď od prvého tréningu. Zváž, či nie je lepší neskorší termín pretekov.`;
        msgSaysWeek = true;
      } else {
        msg = `⚠️ Pozor: ${weeksLeft(prepWeeks)} prípravy. Z 18-týždňového plánu stihneš len úvod — ani tempové zosilnenie, ani vylaďovanie pred pretekmi. Zváž, či nie je lepší neskorší termín pretekov.`;
      }
    } else {
      msg = `🚫 Na poctivú Hanson prípravu je už neskoro (ostáva ~${prepWeeks} týž.). Odporúčam vybrať neskoršie preteky, alebo ber tieto bez tlaku na čas — ako tréningové.`;
    }
    if (customStart && skipsStart && !msgSaysWeek) {
      msg += ` (Tvoj zadaný začiatok je v minulosti — appka počíta, že si už v ${weekNow}. týždni prípravy.)`;
    }
    setRaceDateWarning(msg);
  }, [raceDate, customStart, trainingStart]);

  // Hodnoty formulára odvodené z profilu — na jednom mieste, aby sa porovnanie
  // „uložené vs. rozpísané" nerozišlo s tým, čo sa do formulára naozaj naleje.
  // Začiatok prípravy dopočítavame rovnako, ako to hneď po načítaní spraví efekt vyššie
  // (preteky − 18 týž.). Bez toho by porovnanie „uložené vs. rozpísané" bralo default
  // 2026-06-01 a appka by hlásila neuložené zmeny hneď po otvorení Nastavení, bez toho,
  // aby sa zverenec čohokoľvek dotkol.
  const formFromProfile = (p: any) => ({
    displayName: p?.display_name || "",
    email: p?.garmin_email || "",
    targetTime: p?.target_time || "1:50:00",
    trainingStart: p?.training_start_date || (p?.race_date ? officialStartIso(p.race_date) : "2026-06-01"),
    raceDate: p?.race_date || "",
    planVariant: p?.plan_variant || "advanced",
    aiContext: p?.ai_context || "",
  });

  const loadProfile = () => {
    setLoading(true);
    setLoadError(null);
    fetchProfile()
      .then((profile) => {
        // Prázdny profil (target_time aj training_start_date null) je legitímny stav
        // nového zverenca — chyba je až to, keď server nevráti objekt profilu.
        if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
          throw new Error("Server nevrátil profil.");
        }
        const f = formFromProfile(profile);
        setDisplayName(f.displayName);
        setEmail(f.email);
        setTargetTime(f.targetTime);
        setPlanVariant(f.planVariant);
        setTrainingStart(f.trainingStart);
        setRaceDate(f.raceDate);
        setAiContext(f.aiContext);
        // Ak uložený začiatok nezodpovedá automatickému (race - 18 týž.), je to vlastný začiatok
        if (profile.race_date && profile.training_start_date) {
          const auto = officialStartIso(profile.race_date);
          if (profile.training_start_date !== auto) setCustomStart(true);
        }
        setSavedProfile(profile);
        setLoading(false);
      })
      .catch((e: any) => {
        setLoadError(e?.message || "Neznáma chyba");
        setLoading(false);
      });
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Bez načítaného profilu sa neukladá — uložili by sme defaulty formulára cez reálne dáta.
    if (!savedProfile) return;

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
      // Meno a poznámky posielame aj prázdne. S `|| undefined` ich backend preskočil,
      // takže vymazanie sa neuložilo — a snapshot nižšie by si napriek tomu zapísal
      // prázdnu hodnotu a indikátor neuložených zmien by zhasol.
      await updateProfile({
        display_name: displayName,
        garmin_email: email,
        garmin_password: password || undefined,
        target_time: targetTime,
        training_start_date: trainingStart,
        // Posielame aj prázdny reťazec — je to legitímne vymazanie termínu. S `|| undefined`
        // by backend pole preskočil, na serveri by ostal starý dátum a indikátor neuložených
        // zmien by svietil navždy.
        race_date: raceDate,
        ai_context: aiContext,
        plan_variant: planVariant,
      });
      // Invalidate store — nové profil dáta ovplyvnia výpočty
      store.invalidateAll();
      // Posuň snapshot uloženého stavu, nech kontrolný zoznam aj upozornenie
      // na neuložené zmeny hneď zodpovedajú realite.
      setSavedProfile((p: any) => ({
        ...(p || {}),
        display_name: displayName,
        garmin_email: email,
        target_time: targetTime,
        training_start_date: trainingStart,
        race_date: raceDate,
        plan_variant: planVariant,
        ai_context: aiContext,
      }));
      // Výsledok overenia sa týkal PREDOŠLÝCH uložených údajov — po uložení nových by
      // červený panel „nesprávne heslo" klamal. Zahodíme ho a necháme overiť nanovo.
      setGarminCheck(null);
      setGarminCheckError(null);
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

  // Neuložené zmeny: tlačidlá typu „Použiť tento čas" iba naplnia pole, preto musí byť
  // vidieť, že cieľ ešte nie je uložený.
  const currentForm = { displayName, email, targetTime, trainingStart, raceDate, planVariant, aiContext };
  const isDirty =
    !!savedProfile &&
    (password.length > 0 || JSON.stringify(currentForm) !== JSON.stringify(formFromProfile(savedProfile)));

  // Overenie beží na serveri s ULOŽENÝMI údajmi. Keď má zverenec e-mail či heslo len
  // rozpísané, výsledok sa týka starých údajov — treba ho na to upozorniť, inak by
  // z červeného výsledku usúdil, že jeho nové heslo je zlé.
  const garminCredsDirty = password.length > 0 || email !== (savedProfile?.garmin_email || "");

  // Kontrolný zoznam sa počíta z ULOŽENÉHO profilu — nesmie odškrtnúť cieľ,
  // ktorý je zatiaľ len rozpísaný vo formulári.
  const checklist = [
    { done: !!savedProfile?.garmin_email, label: "Prepojený Garmin účet", hint: "e-mail a heslo do Garmin Connect nižšie" },
    { done: !!savedProfile?.target_time, label: "Cieľový čas polmaratónu", hint: "z neho appka počíta tréningové tempá" },
    { done: !!savedProfile?.plan_variant, label: "Variant plánu", hint: "Beginner / Advanced / Just Finish" },
    { done: !!savedProfile?.race_date, label: "Dátum pretekov", hint: "podľa neho sa určí, v ktorom týždni prípravy si" },
  ];
  const checklistLeft = checklist.filter((i) => !i.done).length;

  // Nový zverenec vidí vo formulári predvyplnený cieľ 1:50:00 a variant Advanced, hoci
  // v profile nie sú uložené — bez zásahu do formulára nie sú ani „neuložené zmeny“,
  // takže nič nenaznačí, že tieto hodnoty treba potvrdiť tlačidlom Uložiť.
  const unconfirmedDefaults = [
    !savedProfile?.target_time ? `cieľový čas ${targetTime || "1:50:00"}` : null,
    !savedProfile?.plan_variant ? `variant ${VARIANT_LABELS[planVariant] || planVariant}` : null,
  ].filter(Boolean) as string[];
  const unconfirmedNote =
    unconfirmedDefaults.length === 0
      ? null
      : unconfirmedDefaults.length === 1
        ? `Pozor: ${unconfirmedDefaults[0]} je vo formulári nižšie len predvyplnený návrh — appka ho zatiaľ nemá uložený. Skontroluj ho, uprav podľa seba a potvrď tlačidlom „Uložiť profil“ dole.`
        : `Pozor: ${unconfirmedDefaults.join(" a ")} sú vo formulári nižšie len predvyplnené návrhy — appka ich zatiaľ nemá uložené. Skontroluj ich, uprav podľa seba a potvrď tlačidlom „Uložiť profil“ dole.`;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  // Pri zlyhaní načítania NEPONÚKAME formulár ani uloženie — len vysvetlenie a nový pokus.
  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-4 pt-16 px-2 text-center">
        <AlertCircle size={36} className="text-rose-400" />
        <h1 className="text-xl font-bold">Nastavenia sa nepodarilo načítať</h1>
        <p className="text-sm text-gray-400 leading-relaxed max-w-sm">
          Tvoj profil (cieľový čas, Garmin účet, dátum pretekov) sa teraz nedá načítať zo servera.
          Formulár preto nezobrazujeme — keby si ho uložil, prepísal by si si uložené údaje
          prázdnymi hodnotami. Skontroluj pripojenie na internet a skús to znova.
        </p>
        <p className="text-xs text-gray-600">Detail chyby: {loadError}</p>
        <button
          onClick={loadProfile}
          className="mt-2 bg-primary hover:bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2"
        >
          <RefreshCw size={16} />
          Skúsiť znova
        </button>
        <button
          onClick={handleLogout}
          className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 mt-2"
        >
          Odhlásiť sa
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pt-4 pb-32">
      <div className="mb-2">
        <h1 className="text-2xl font-bold">Nastavenia</h1>
        <p className="text-gray-400 text-sm">Spravuj svoj profil a ciele</p>
      </div>

      {/* Čo ešte treba vyplniť — nováčik inak netuší, prečo mu appka nepočíta plán */}
      {checklistLeft > 0 ? (
        <div className="bg-black/20 border border-white/10 rounded-xl p-3">
          <p className="text-[11px] font-bold text-gray-300 mb-2">
            Aby appka fungovala, vyplň ešte {checklistLeft} {checklistLeft === 1 ? "vec" : "veci"}:
          </p>
          <ul className="flex flex-col gap-1.5">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-start gap-2 text-xs">
                {item.done ? (
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Circle size={14} className="text-gray-600 shrink-0 mt-0.5" />
                )}
                <span className={item.done ? "text-gray-600 line-through" : "text-gray-300"}>
                  {item.label}
                  {!item.done && <span className="text-gray-600"> — {item.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-gray-600 mt-2">
            Odškrtne sa až po uložení tlačidlom „Uložiť profil" dole.
          </p>
          {/* Predvyplnené hodnoty vyzerajú ako hotové — treba povedať, že ich appka ešte nemá */}
          {unconfirmedNote && (
            <p className="text-[11px] text-amber-300 mt-2 leading-relaxed">
              {unconfirmedNote} Až potom podľa {unconfirmedDefaults.length === 1 ? "nej" : "nich"} appka začne počítať tvoj plán a tempá.
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>Všetko vyplnené — appka má všetko, čo na tvoj plán potrebuje.</span>
        </div>
      )}

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

          {/* Overenie prepojenia — bez neho sa zverenec o zlom hesle dozvie až tým,
              že mu appka celé dni nesťahuje behy a netuší prečo. */}
          <div>
            <button
              type="button"
              onClick={handleGarminCheck}
              disabled={garminChecking}
              className="inline-flex items-center gap-1.5 bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary text-xs font-bold px-3 py-2 rounded-xl transition-colors disabled:opacity-60"
            >
              {garminChecking ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
              {garminChecking ? "Overujem prepojenie…" : "Overiť prepojenie s Garminom"}
            </button>
            <p className="text-[11px] text-gray-600 mt-1.5 ml-1 leading-snug">
              Appka sa skúsi prihlásiť do Garmin Connect <b className="text-gray-500">naposledy uloženými</b> údajmi.
              Nič sa tým nemení ani neukladá — len sa zistí, či prepojenie funguje.
            </p>
            {garminCredsDirty && (
              <p className="text-[11px] text-amber-300 mt-1 ml-1 leading-snug">
                E-mail alebo heslo máš rozpísané, ale ešte neuložené. Over až po kliknutí na „Uložiť profil“
                dole — inak sa overia staré údaje a výsledok ťa pomýli.
              </p>
            )}

            {/* Prebieha */}
            {garminChecking && (
              <p className="mt-2 flex items-start gap-2 text-xs text-gray-400 leading-relaxed">
                <Loader2 size={14} className="animate-spin text-primary shrink-0 mt-0.5" />
                Prihlasujem sa do Garmin Connect… môže to trvať aj pár sekúnd.
              </p>
            )}

            {/* Volanie zlyhalo (sieť, server nedostupný) — vlastná hláška + nový pokus */}
            {!garminChecking && garminCheckError && (
              <div className="mt-2 flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-300 leading-relaxed">
                  <p>{garminCheckError}</p>
                  <button
                    type="button"
                    onClick={handleGarminCheck}
                    className="mt-2 inline-flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 font-bold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <RefreshCw size={12} /> Skúsiť znova
                  </button>
                </div>
              </div>
            )}

            {/* Odpoveď servera: úspech alebo zrozumiteľne vysvetlený neúspech */}
            {!garminChecking && !garminCheckError && garminCheck && (
              garminCheck.ok ? (
                <div className="mt-2 flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <p className="text-emerald-300 font-bold">
                      Prepojenie funguje{garminCheck.name ? ` — prihlásený ako ${garminCheck.name}` : ""}.
                    </p>
                    {/* Hlášku zo servera pri úspechu NEopakujeme — nesie to isté meno aj tú istú
                        vetu, takže by sa celé zdvojila. Pri neúspechu je naopak kľúčová. */}
                    <p className="text-gray-400 mt-0.5">Nemusíš nič robiť.</p>
                  </div>
                </div>
              ) : (() => {
                // Chyba na strane zverenca (heslo, 2FA, chýbajúce údaje) = červená, treba
                // niečo urobiť. Dočasný problém (limit, výpadok) = žltá, stačí počkať.
                const needsAction =
                  garminCheck.reason === "credentials" ||
                  garminCheck.reason === "mfa" ||
                  garminCheck.reason === "missing";
                const advice = garminCheck.reason ? GARMIN_ADVICE[garminCheck.reason] : undefined;
                return (
                  <div
                    className={`mt-2 flex items-start gap-2 rounded-xl p-3 border ${
                      needsAction
                        ? "bg-rose-500/10 border-rose-500/20"
                        : "bg-amber-500/10 border-amber-500/20"
                    }`}
                  >
                    <ShieldAlert
                      size={14}
                      className={`shrink-0 mt-0.5 ${needsAction ? "text-rose-400" : "text-amber-400"}`}
                    />
                    <div className="text-xs leading-relaxed">
                      <p className={needsAction ? "text-rose-300 font-bold" : "text-amber-300 font-bold"}>
                        Prepojenie zatiaľ nefunguje
                      </p>
                      <p className="text-gray-300 mt-0.5">
                        {garminCheck.message || "Server nepovedal dôvod."}
                      </p>
                      {advice && <p className="text-gray-400 mt-1.5">{advice}</p>}
                      <button
                        type="button"
                        onClick={handleGarminCheck}
                        className={`mt-2 inline-flex items-center gap-1.5 font-bold px-3 py-1.5 rounded-lg transition-colors border ${
                          needsAction
                            ? "bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/30 text-rose-200"
                            : "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30 text-amber-200"
                        }`}
                      >
                        <RefreshCw size={12} /> Overiť znova
                      </button>
                    </div>
                  </div>
                );
              })()
            )}
          </div>

          <div className="flex items-start gap-2 text-xs text-gray-500 bg-black/20 p-3 rounded-xl">
            <Wifi size={14} className="text-emerald-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              Heslo je uložené šifrované. Garmin session sa automaticky obnovuje.
              {/* Nováčik sa oprávnene pýta, prečo od neho appka pýta heslo — treba to povedať rovno */}
              <br />
              Garmin pre aplikácie tohto typu neponúka verejné prihlásenie cez OAuth (teda tlačidlo
              „Prihlásiť sa cez Garmin"), takže sa k tvojim tréningom nedá dostať inak než tvojím
              prihlasovacím menom a heslom. Používajú sa výhradne na sťahovanie tvojich behov,
              tepu a VO2max.
            </span>
          </div>
          <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl">
            <ShieldAlert size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              Ak máš na Garmin účte zapnuté dvojfaktorové overenie (2FA), prihlásenie zlyhá —
              appka nemá kam zadať jednorazový kód. Aby prepojenie fungovalo, treba 2FA
              v nastaveniach Garmin účtu dočasne vypnúť.
            </span>
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
                : <>Z tohto času sa počíta <b className="text-gray-300">väčšina</b> tréningových temp — ľahké (Easy), tempové (Tempo) aj silové (Strength). Rýchlostné intervaly (Speed) sa počítajú z tvojej <b className="text-gray-300">aktuálnej formy</b> (Garmin VO2max), nie z cieľa</>} —
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
                    <span className="text-gray-400">Easy (ľahký beh) / Dlhý beh</span>
                    <span className="text-right font-mono text-emerald-300">{p.easyMin}–{p.easyMax}/km</span>
                    {isJF ? (
                      <>
                        <span className="text-gray-400">Tempo dobehnutia (ref.)</span>
                        <span className="text-right font-mono text-gray-400">~{p.tempo}/km</span>
                      </>
                    ) : (
                      <>
                        <span className="text-gray-400">Tempo (tempový beh)</span>
                        <span className="text-right font-mono text-amber-300">{p.tempo}/km</span>
                        <span className="text-gray-400">Strength (silové intervaly)</span>
                        <span className="text-right font-mono text-orange-300">{p.strength}/km</span>
                        <span className="text-gray-400">Speed (rýchlostné intervaly)</span>
                        <span className="text-right font-mono text-rose-300">~{p.speedApprox}/km</span>
                      </>
                    )}
                  </div>

                  {/* Rozbaliteľné vysvetlivky — bez nich sú Easy/Tempo/Strength/Speed pre nováčika len anglické slová */}
                  <button
                    type="button"
                    onClick={() => setShowPaceLegend((v) => !v)}
                    className="mt-2 text-[11px] text-primary underline underline-offset-2"
                  >
                    {showPaceLegend ? "Skryť vysvetlivky" : "i — čo tieto názvy znamenajú?"}
                  </button>
                  {showPaceLegend && (
                    <div className="mt-2 flex flex-col gap-2 text-[11px] text-gray-400 leading-relaxed border-t border-white/10 pt-2">
                      <p>
                        <b className="text-emerald-300">Easy (ľahký beh)</b> — najpomalšie tempo, o 40 až 75 sekúnd
                        na kilometer pomalšie než tvoje cieľové pretekové tempo (HMP — half marathon pace, teda
                        tempo, ktorým chceš bežať polmaratón). Tvorí väčšinu všetkých kilometrov: buduje vytrvalosť
                        a zároveň necháva telo zotaviť sa medzi tvrdými tréningami. Máš pri ňom vládať rozprávať.
                      </p>
                      {isJF ? (
                        <p>
                          <b className="text-gray-300">Tempo dobehnutia</b> — orientačné tempo, ktorým by si mal
                          preteky dobehnúť. Netrénuje sa, slúži len na to, aby sa z neho dalo odvodiť Easy pásmo.
                        </p>
                      ) : (
                        <>
                          <p>
                            <b className="text-amber-300">Tempo (tempový beh)</b> — beží sa presne v cieľovom
                            pretekovom tempe (HMP). Naučí nohy aj hlavu, ako to tempo má
                            reálne „sedieť", aby si ho v pretekoch trafil bez hádania.
                          </p>
                          <p>
                            <b className="text-orange-300">Strength (silové intervaly)</b> — dlhé úseky o ~6 sekúnd
                            na kilometer rýchlejšie než pretekové tempo, bežané už v nazbieranej únave. Sú jadrom
                            Hansonovej metódy: učia ťa držať tempo vtedy, keď to v pretekoch začne bolieť.
                          </p>
                          <p>
                            <b className="text-rose-300">Speed (rýchlostné intervaly)</b> — krátke rýchle úseky
                            v tvojom aktuálnom 5-kilometrovom tempe. Zlepšujú ekonomiku behu a maximálnu
                            kyslíkovú kapacitu (VO2max), takže pretekové tempo ti potom príde ľahšie.
                          </p>
                        </>
                      )}
                      <p className="text-gray-600">
                        Tempo je pri každom behu hlavný cieľ, tep je len doplnková informácia (v horúčave či únave
                        vyskočí aj pri správnom tempe).
                      </p>
                    </div>
                  )}

                  <p className="text-[10px] text-gray-600 mt-2 leading-relaxed">
                    {isJF
                      ? "Just Finish sa beží celý v Easy tempe — intervaly ani tempo nie sú. „Tempo dobehnutia“ je len orientačná referencia, ktorá kotví Easy pásmo."
                      : <>Tempo, Easy a Strength sa počítajú priamo z cieľového času. <b className="text-gray-500">Speed</b> je tu len orientačný — v pláne sa počíta z tvojej aktuálnej formy (Garmin VO2max), nie z cieľa. Tempo Speed intervalov teda nenastavuješ ty, appka si ho zoberie z Garminu.</>}
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
                  <span className="text-[10px] text-gray-500 ml-2">iba doplní čas do políčka — ulož ho nižšie</span>
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
            {/* Tlačidlo nenastavuje tempá intervalov — navrhuje cieľový čas, to treba povedať jasne */}
            <p className="text-[11px] text-gray-600 mt-1.5 ml-1 leading-snug">
              Neisté, aký cieľ je pre teba reálny? Tlačidlo navrhne <b className="text-gray-500">cieľový čas
              polmaratónu</b> podľa tvojej aktuálnej formy (Garmin VO2max) alebo podľa času z nedávnych pretekov.
              Návrh sa iba doplní do políčka vyššie — nič sa tým nenastavuje ani neukladá, kým klikneš „Uložiť profil".
            </p>

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
                  Tlačidlo „Použiť tento čas" ho len doplní do políčka vyššie; uloží sa až tlačidlom
                  „Uložiť profil" dole.
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

            {/* Nenápadná pomôcka pre toho, komu tri anglické slová nič nehovoria */}
            <button
              type="button"
              onClick={() => setWizardOpen((v) => !v)}
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-primary underline underline-offset-2"
              aria-expanded={wizardOpen}
            >
              <HelpCircle size={13} />
              {wizardOpen ? "Zavrieť sprievodcu" : "Neviem si vybrať — poradiť s výberom"}
            </button>

            {wizardOpen && (
              <div className="mt-2 bg-black/20 border border-white/10 rounded-xl p-3 flex flex-col gap-3">
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Odpovedz na tri otázky a odporučím ti variant. Nič sa tým nemení — výber si potom
                  potvrdíš sám.
                </p>

                <div>
                  <p className="text-xs text-gray-300 mb-1.5">1. Bežal si už polmaratón?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { v: "yes", l: "Áno" },
                      { v: "no", l: "Nie" },
                    ] as const).map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        aria-pressed={wizard.ranHalf === o.v}
                        onClick={() => setWizard((w) => ({ ...w, ranHalf: o.v }))}
                        className={wizardBtn(wizard.ranHalf === o.v)}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-300 mb-1.5">2. Koľko dní v týždni teraz pravidelne behávaš?</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { v: "0-2", l: "0 – 2 dni" },
                      { v: "3-4", l: "3 – 4 dni" },
                      { v: "5+", l: "5 a viac" },
                    ] as const).map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        aria-pressed={wizard.days === o.v}
                        onClick={() => setWizard((w) => ({ ...w, days: o.v }))}
                        className={wizardBtn(wizard.days === o.v)}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-300 mb-1.5">3. Čo je tvoj cieľ?</p>
                  {/* Tieto dve odpovede sú dlhé — na mobile musia byť pod sebou, nie v dvoch stĺpcoch */}
                  <div className="grid grid-cols-1 gap-2">
                    {([
                      { v: "time", l: "Zabehnúť konkrétny čas" },
                      { v: "finish", l: "Pohodovo dobehnúť" },
                    ] as const).map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        aria-pressed={wizard.goal === o.v}
                        onClick={() => setWizard((w) => ({ ...w, goal: o.v }))}
                        className={wizardBtn(wizard.goal === o.v)}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const rec = recommendVariant(wizard);
                  if (!rec) {
                    return (
                      <p className="text-[11px] text-gray-600 border-t border-white/10 pt-3 leading-relaxed">
                        Odpovedz na všetky tri otázky — odporúčanie sa ukáže tu.{" "}
                        <button
                          type="button"
                          onClick={() => setWizardOpen(false)}
                          className="text-gray-500 hover:text-gray-300 underline underline-offset-2"
                        >
                          Zavrieť bez zmeny
                        </button>
                      </p>
                    );
                  }
                  const label = VARIANT_LABELS[rec.key] || rec.key;
                  const already = planVariant === rec.key;
                  return (
                    <div className="border-t border-white/10 pt-3">
                      <p className="text-[11px] font-bold text-emerald-300 mb-1">
                        Odporúčam ti variant {label}
                      </p>
                      <p className="text-xs text-gray-300 leading-relaxed">{rec.why}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPlanVariant(rec.key); // len predvyplní výber vyššie
                            setWizardOpen(false);
                          }}
                          className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Nastaviť {label}
                        </button>
                        <button
                          type="button"
                          onClick={() => setWizard(EMPTY_WIZARD)}
                          className="text-[11px] text-gray-500 hover:text-gray-300 underline underline-offset-2"
                        >
                          Odpovedať znova
                        </button>
                        <button
                          type="button"
                          onClick={() => setWizardOpen(false)}
                          className="text-[11px] text-gray-500 hover:text-gray-300 underline underline-offset-2"
                        >
                          Zavrieť bez zmeny
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-2 leading-relaxed">
                        {already ? `Variant ${label} máš vo výbere vyššie zvolený už teraz. ` : ""}
                        Tlačidlo iba predvyplní výber vyššie — uloží sa až tlačidlom „Uložiť profil“ dole.
                        Odporúčanie je návrh, nie príkaz: ak sa cítiš inak, pokojne si zvoľ iný variant.
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}

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

      {/* Indikátor neuložených zmien — inak si zverenec myslí, že vyplnené = uložené */}
      {isDirty && !saving && (
        <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 -mb-3">
          <AlertCircle size={14} className="shrink-0" />
          <span>Máš neuložené zmeny. Uložia sa až tlačidlom nižšie.</span>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className={`bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] flex justify-center items-center gap-2 ${
          isDirty ? "ring-2 ring-amber-400/60" : ""
        }`}
      >
        {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
        {saving ? "Ukladám..." : isDirty ? "Uložiť profil (neuložené zmeny)" : "Uložiť profil"}
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
