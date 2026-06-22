"use client";

import { ChevronDown, BookOpen, RotateCcw } from "lucide-react";
import { openOnboarding } from "@/components/Onboarding";

// Tap-prístupná „rozbaľovačka" (natívny <details> — funguje aj bez JS, ideálne na mobil).
function Item({ q, children, defaultOpen = false }: { q: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="glass-card rounded-2xl overflow-hidden group">
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3 font-bold text-sm">
        <span>{q}</span>
        <ChevronDown size={18} className="text-gray-400 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 -mt-1 text-sm text-gray-300 leading-relaxed flex flex-col gap-2">
        {children}
      </div>
    </details>
  );
}

function Term({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <p>
      <b className="text-gray-100">{name}</b> — {children}
    </p>
  );
}

export default function About() {
  return (
    <div className="flex flex-col gap-5 pt-4 pb-32">
      <header className="flex items-center gap-3">
        <div className="bg-primary/15 text-primary p-2.5 rounded-xl">
          <BookOpen size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">O metóde</h1>
          <p className="text-gray-400 text-sm">Hansonova polmaratónová metóda — vysvetlená</p>
        </div>
      </header>

      <button
        onClick={openOnboarding}
        className="glass-card p-3 flex items-center justify-center gap-2 text-sm font-bold text-primary hover:bg-white/5 transition-colors"
      >
        <RotateCcw size={16} /> Znova spustiť úvod
      </button>

      <div className="flex flex-col gap-3">
        <Item q="Čo je Hansonova metóda?" defaultOpen>
          <p>
            Tréningový systém manželov Hansonovcov (a trénera Luka Humphreyho) na prípravu na
            polmaratón. Stavia na <b className="text-gray-100">objeme a pravidelnosti</b> namiesto
            jedného extrémne dlhého behu. Beháš 6 dní v týždni, z toho 3 sú kľúčové („tvrdé")
            tréningy a zvyšok ľahké behy. Plán trvá 18 týždňov.
          </p>
        </Item>

        <Item q="Kumulovaná únava — prečo sa cítim unavený?">
          <p>
            Toto je jadro celej metódy. Tréningy zámerne neabsolvuješ úplne oddýchnutý —
            beháš na <b className="text-gray-100">mierne unavených nohách</b>, aby si telo zvyklo
            na pocit zo záveru pretekov (posledné km, keď to najviac bolí).
          </p>
          <p>
            Preto sú ľahké (Easy) behy také dôležité: nie sú „voľno navyše", sú nástroj
            regenerácie aj budovania únavy zároveň. <b className="text-gray-100">Mierna únava je
            zámer, nie pretrénovanie.</b> Pozor však na rozdiel: bežná svalová únava je v poriadku,
            ostrá alebo pretrvávajúca bolesť je signál spomaliť.
          </p>
        </Item>

        <Item q="3 kľúčové tréningy (SOS)">
          <p>
            SOS = „Something of Substance" — 3 náročné tréningy týždňa. Medzi nimi je vždy ľahký
            beh alebo voľno (<b className="text-gray-100">nikdy nie 2 tvrdé dni za sebou</b>).
          </p>
          <Term name="Speed (rýchlosť, utorky T2–10)">
            krátke intervaly na tvojom aktuálnom 5K tempe — rozvíja VO2max a bežeckú ekonomiku.
          </Term>
          <Term name="Strength (sila, utorky T11–17)">
            dlhšie intervaly tesne pod pretekovým tempom (HMP − 10 s/míľu) — naučí ťa držať tempo
            na unavených nohách.
          </Term>
          <Term name="Tempo (štvrtky)">
            súvislý beh presne na cieľovom pretekovom tempe (HMP) — telo si zvyká na pretekové úsilie.
          </Term>
          <Term name="Dlhý beh (nedele)">
            najdlhší beh týždňa, ale v <b className="text-gray-100">ľahkom (Easy) tempe</b>, nie
            pretekovom. Na polmaratón vrcholí okolo 12 míľ (~19 km).
          </Term>
        </Item>

        <Item q="Tréningové tempá — z čoho sa počítajú?">
          <p>Hanson sa riadi <b className="text-gray-100">tempom, nie tepom</b>. Tep je len doplnková referencia.</p>
          <Term name="HMP">Half-Marathon Pace — tvoje cieľové pretekové tempo. Z neho sa počíta väčšina ostatných temp.</Term>
          <Term name="Easy / Dlhé">pohodlné, o ~1–2 min/míľu pomalšie než cieľ. Musí byť naozaj ľahké.</Term>
          <Term name="Tempo">presne cieľové HMP.</Term>
          <Term name="Strength">HMP − 10 s/míľu (o čosi rýchlejšie než Easy, pomalšie než Speed).</Term>
          <Term name="Speed">tvoje aktuálne 5K tempo — odhadnuté z Garmin VO2max alebo posledných pretekov (z reálnej formy, NIE z cieľa).</Term>
        </Item>

        <Item q="18 týždňov a 4 fázy">
          <Term name="Úvod (T1)">len ľahké behy, rozbeh a adaptácia.</Term>
          <Term name="Speed (T2–10)">krátke rýchle intervaly — rýchlosť a ekonomika.</Term>
          <Term name="Strength (T11–17)">dlhšie intervaly pri pretekovom tempe — sila a odolnosť. Objem vrcholí (~T14–16).</Term>
          <Term name="Taper (T18)">posledný týždeň — výrazne menej behu, aby si na štart prišiel svieži.</Term>
        </Item>

        <Item q="Taper a pretekový týždeň">
          <p>
            Posledný týždeň znížiš objem o ~50–60 %, ale zachováš frekvenciu a trochu pretekového
            tempa. <b className="text-gray-100">Žiadne nové vzdialenosti ani tvrdé intervaly.</b>
          </p>
          <p>
            Cieľom je sviežosť, nie ďalšia kondícia. „Ťažké nohy" a nervozita v tomto týždni sú
            normálne — dôveruj príprave. Priorita: spánok, sacharidy, hydratácia.
          </p>
        </Item>

        <Item q="Tvoje Garmin metriky — čo znamenajú">
          <Term name="A:C záťaž (akútna : chronická)">pomer záťaže za ~7 dní k ~28-dňovému priemeru. 0,8–1,4 = bezpečné pásmo; nad 1,4 = priveľa priskoro (uber); pod 0,8 = priestor pridať.</Term>
          <Term name="VO2max">odhad aeróbnej kapacity. Appka z neho odhaduje tvoje aktuálne 5K tempo pre Speed intervaly.</Term>
          <Term name="LTHR">tep na laktátovom prahu. Slúži ako referenčný strop (poistka, aby Easy nebol prirýchly), nie ako cieľ.</Term>
          <Term name="HRV">variabilita tepu — ukazovateľ regenerácie a stresu. Vyššie/stabilné = oddýchnuté telo.</Term>
          <Term name="Body Battery">odhad zásob energie tela (0–100). Ráno vysoké = nabitý.</Term>
          <Term name="Pripravenosť">Garmin odhad, ako je telo pripravené na záťaž. Nízke = zvoľ ľahší tréning.</Term>
          <Term name="Kadencia (spm)">počet krokov za minútu. Aeróbny efekt = ako tréning zaťažil aeróbny systém (1–5).</Term>
        </Item>

        <Item q="Časté chyby začiatočníka">
          <p>• <b className="text-gray-100">Easy behy prirýchlo</b> — chyba č. 1, pokazí regeneráciu aj kľúčové tréningy.</p>
          <p>• <b className="text-gray-100">Vynechávanie ľahkých behov</b> — objem a pravidelnosť robia metódu.</p>
          <p>• <b className="text-gray-100">Prehnaný cieľový čas</b> — celý plán potom beží prirýchlo. Cieľ stanov realisticky podľa nedávnej formy.</p>
          <p>• <b className="text-gray-100">Naháňanie zmeškaných tréningov</b> — radšej pokračuj podľa plánu, nikdy nie 2 tvrdé dni za sebou.</p>
        </Item>
      </div>
    </div>
  );
}
