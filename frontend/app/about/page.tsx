"use client";

import { useEffect } from "react";
import Link from "next/link";
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

// `id` je voliteľné: v slovníčku slúži ako kotva, aby sa dalo z appky odkázať na konkrétny
// pojem (napr. /about#pojem-hmp); `scroll-mt-*` drží pojem pod spodným okrajom obrazovky.
function Term({ name, children, id }: { name: string; children: React.ReactNode; id?: string }) {
  return (
    <p id={id} className={id ? "scroll-mt-20" : undefined}>
      <b className="text-gray-100">{name}</b> — {children}
    </p>
  );
}

export default function About() {
  // Kotvy slovníčka (/about#pojem-hmp) ležia vnútri natívneho <details>, ktorý je defaultne
  // zatvorený — na skrytý cieľ prehliadač neodroluje a skok ticho zlyhá. Rodičovský <details>
  // preto otvoríme ručne a až potom skočíme na pojem.
  useEffect(() => {
    const openHashTarget = () => {
      const raw = window.location.hash.replace(/^#/, "");
      // Poškodený hash (napr. „#%") by decodeURIComponent zhodil výnimkou.
      let id = raw;
      try { id = decodeURIComponent(raw); } catch { /* ignore */ }
      if (!id.startsWith("pojem-")) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.closest("details")?.setAttribute("open", "");
      // Rozbalenie slovníčka (21 pojmov) výrazne predĺži stránku. Jeden snímok na dopočítanie
      // layoutu nemusí stačiť, preto skrolujeme až po druhom — inak by skok trafil vedľa.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }))
      );
    };
    openHashTarget();
    // Odkaz na už otvorenej stránke zmení len hash — bez tohto by sa nič nestalo.
    window.addEventListener("hashchange", openHashTarget);
    return () => window.removeEventListener("hashchange", openHashTarget);
  }, []);

  return (
    <div className="flex flex-col gap-5 pt-4 pb-32">
      <header className="flex items-center gap-3">
        <div className="bg-primary/15 text-primary p-2.5 rounded-xl">
          <BookOpen size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">O metóde</h1>
          <p className="text-gray-400 text-sm">Hansonova metóda — polmaratónová príprava, vysvetlená</p>
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
            Tréningový systém bratov Hansonovcov — Keitha a Kevina, zakladateľov tímu
            Hansons–Brooks Distance Project — a trénera Luka Humphreyho, na prípravu na
            polmaratón. Stavia na <b className="text-gray-100">objeme a pravidelnosti</b> namiesto
            jedného extrémne dlhého behu. Beháš zvyčajne 6 dní v týždni, z toho spravidla 3 sú kľúčové („tvrdé")
            tréningy a zvyšok ľahké behy. Plán trvá 18 týždňov. (Odľahčený variant Just Finish je celý
            v ľahkom tempe — podrobnosti nižšie.)
          </p>
        </Item>

        <Item q="Ktorý plán je pre teba? (3 varianty)">
          <p>
            Metóda má tri varianty — vyber si podľa cieľa a skúseností. Variant nastavíš v{" "}
            <Link href="/settings" className="text-primary underline underline-offset-2">Nastaveniach</Link>;
            plán aj rady trénera sa mu potom prispôsobia.
          </p>
          <Term name="Beginner">
            prvý polmaratón alebo návrat po pauze. Prvých 5 týždňov je base fáza (len ľahké behy a dlhý
            beh), intervaly a tempo prídu až od T6. O niečo nižší objem.
          </Term>
          <Term name="Advanced">
            už si polmaratón bežal a chceš zlepšiť čas. Plný objem, fázy Speed aj Strength (po úvodnom týždni).
          </Term>
          <Term name="Just Finish">
            cieľ je pohodovo dobehnúť, nie zabehnúť čas. Žiadne intervaly ani tempo — len ľahké behy a
            nedeľný dlhý beh (vrchol ~16 km). Ideálne, keď ti ide o dokončenie bez tlaku na tempo.
          </Term>
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
            krátke intervaly na tvojom aktuálnom 5 km tempe — rozvíja VO2max a bežeckú ekonomiku.
          </Term>
          <Term name="Strength (sila, utorky T11–17)">
            dlhšie intervaly o 6 s/km <b className="text-gray-100">rýchlejšie</b> než cieľové
            pretekové tempo (HMP − 6 s/km) — naučia ťa držať tempo na unavených nohách.
          </Term>
          <Term name="Tempo (štvrtky)">
            súvislý beh presne na cieľovom pretekovom tempe (HMP) — telo si zvyká na pretekové úsilie.
          </Term>
          <Term name="Dlhý beh (nedele)">
            najdlhší beh týždňa, ale v <b className="text-gray-100">ľahkom (Easy) tempe</b>, nie
            pretekovom. Na polmaratón vrcholí okolo 19 km — appka ho nikdy nepustí nad 19,5 km
            a v plnom tréningovom týždni (aspoň 4 behy) ani nad ~30 % týždenného objemu.
            Vo variante <b className="text-gray-100">Just Finish</b> platí nižší strop ~16 km a
            pravidlo 30 % sa neuplatňuje.
          </Term>
          <p className="text-[13px] text-gray-500 leading-relaxed mt-1">
            Časovanie utorkov platí pre <b className="text-gray-400">Advanced</b>.
            <b className="text-gray-400"> Beginner</b> má úvodnú base fázu — intervaly aj tempo začína
            až od T6. <b className="text-gray-400">Just Finish</b> je celý bez intervalov a tempa
            (len Easy behy + nedeľný dlhý beh do ~16 km).
          </p>
        </Item>

        <Item q="Tréningové tempá — z čoho sa počítajú?">
          <p>Hanson sa riadi <b className="text-gray-100">tempom, nie tepom</b>. Tep je len doplnková referencia.</p>
          <Term name="HMP">Half-Marathon Pace — tvoje cieľové pretekové tempo. Z neho sa počíta väčšina ostatných temp.</Term>
          <Term name="Easy / Dlhé">pohodlné, o ~40–75 s/km pomalšie než cieľ. Musí byť naozaj ľahké.</Term>
          <Term name="Tempo">presne cieľové HMP.</Term>
          <Term name="Strength">HMP − 6 s/km, teda o 6 s/km rýchlejšie než cieľové pretekové tempo (rýchlejšie než Tempo, pomalšie než Speed).</Term>
          <Term name="Speed">tvoje aktuálne 5 km tempo — odhadnuté z Garmin VO2max alebo posledných pretekov (z reálnej formy, NIE z cieľa).</Term>
          <p className="text-[13px] text-gray-500 leading-relaxed mt-1">
            <b className="text-gray-400">Just Finish</b> beží celý v Easy tempe — Tempo, Strength ani Speed sa
            netrénujú (cieľ je dobehnúť, nie zabehnúť čas). HMP tam slúži len ako orientačné tempo dobehnutia.
          </p>
        </Item>

        <Item q="18 týždňov a 4 fázy">
          <Term name="Úvod (T1)">len ľahké behy, rozbeh a adaptácia.</Term>
          <Term name="Speed (T2–10)">krátke rýchle intervaly — rýchlosť a ekonomika.</Term>
          <Term name="Strength (T11–17)">dlhšie intervaly o 6 s/km rýchlejšie než cieľové pretekové tempo (HMP) — sila a odolnosť. Objem vrcholí (~T14–16).</Term>
          <Term name="Taper (T18)">posledný týždeň — výrazne menej behu, aby si na štart prišiel svieži.</Term>
          <p className="text-[13px] text-gray-500 leading-relaxed mt-1">
            Fázy vyššie sú pre <b className="text-gray-400">Advanced</b>.
            <b className="text-gray-400"> Beginner</b>: T1–5 je base (len Easy + dlhý beh), Speed až
            T6–10, Strength T11–17. <b className="text-gray-400">Just Finish</b>: bez Speed/Strength
            fáz — len postupne rastúci objem a dlhý beh.
          </p>
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

        <Item q="Výživa a pitný režim">
          <p>
            Pri behoch <b className="text-gray-100">nad ~75–90 minút</b> telu dochádzajú zásoby
            glykogénu — dopĺňaj sacharidy priebežne, orientačne <b className="text-gray-100">30–60 g/h</b>
            {" "}(gél, banán, ionťák). Kratšie behy fueling počas behu nepotrebujú.
          </p>
          <p>
            <b className="text-gray-100">Pred behom:</b> ľahké sacharidy 1–2 h vopred (banán, toast,
            ovsené vločky). <b className="text-gray-100">Po behu:</b> sacharidy + bielkoviny do
            ~30–60 min na regeneráciu (kumulovaná únava si žiada poctivé dopĺňanie).
          </p>
          <p>
            <b className="text-gray-100">Dlhý beh = tréning žalúdka.</b> Vyskúšaj presne tú výživu a
            tekutiny, ktoré chceš použiť na pretekoch — v deň D nič nové.
          </p>
        </Item>

        <Item q="Rozcvička a strečing">
          <p>
            <b className="text-gray-100">Pred behom</b> si daj dynamickú rozcvičku — pohybové cviky,
            ktoré prebudia svaly a nervový systém (statické naťahovanie pred behom výkon naopak zníži).
            Zvlášť dôležitá je pred Speed a Strength tréningom.
          </p>
          <p>
            <b className="text-gray-100">Po behu</b>, keď sú svaly teplé, príde na rad statický strečing —
            podporí regeneráciu a je lacnou prevenciou zranení.
          </p>
          <div className="grid grid-cols-3 gap-2 mt-1">
            <Link
              href="/warmup?type=before"
              className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-2 py-2.5 flex flex-col items-center gap-1 text-center transition-colors"
            >
              <span className="text-lg leading-none">🏃</span>
              <span className="text-xs font-bold text-gray-200">Rozcvička</span>
            </Link>
            <Link
              href="/warmup?type=after"
              className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-2 py-2.5 flex flex-col items-center gap-1 text-center transition-colors"
            >
              <span className="text-lg leading-none">🧘</span>
              <span className="text-xs font-bold text-gray-200">Strečing</span>
            </Link>
            <Link
              href="/warmup?type=strength"
              className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-2 py-2.5 flex flex-col items-center gap-1 text-center transition-colors"
            >
              <span className="text-lg leading-none">💪</span>
              <span className="text-xs font-bold text-gray-200">Silový deň</span>
            </Link>
          </div>
        </Item>

        <Item q="Tvoje Garmin metriky — čo znamenajú">
          <Term name="A:C záťaž (akútna : chronická)">pomer záťaže za posledných ~7 dní k ~28-dňovému priemeru. 0,8–1,4 = bezpečné pásmo; nad 1,4 = priveľa priskoro (riziko preťaženia); pod 0,8 = priestor pridať.</Term>
          <Term name="VO2max">odhad maximálnej spotreby kyslíka (ml/kg/min) — koľko kyslíka telo dokáže využiť pri najvyššej záťaži. Vyššie = lepšia aeróbna kondícia. Appka z neho odhaduje tvoje aktuálne 5 km tempo pre Speed intervaly (Advanced/Beginner).</Term>
          <Term name="Pokojový tep (RHR)">tep v úplnom pokoji, meraný cez noc. Nižší a klesajúci = lepšia kondícia a regenerácia. Náhle zvýšenie môže signalizovať únavu alebo nastupujúcu chorobu.</Term>
          <Term name="Laktátový prah (LTHR)">tep na laktátovom prahu — hranica, nad ktorou už telo nestíha odbúravať laktát. V appke slúži len ako strop-poistka (aby Easy nebol prirýchly), nikdy nie ako cieľ behu.</Term>
          <Term name="HRV">variabilita srdcového tepu — rozdiely medzi jednotlivými údermi srdca (v ms), ukazovateľ regenerácie a stresu. Vyššie a stabilné hodnoty = oddýchnuté telo, prepad často predchádza únave alebo chorobe.</Term>
          <Term name="Body Battery">Garmin odhad zásob energie tela (0–100). Ráno vysoké = si nabitý, cez deň prirodzene klesá.</Term>
          <Term name="Pripravenosť">Garmin skóre (0–100), ako je telo dnes pripravené na záťaž (zo spánku, HRV a únavy). Nízke = zvoľ ľahší tréning.</Term>
          <Term name="Kadencia (spm)">počet krokov za minútu (spm, steps per minute). Vyššia kadencia (~170–180) býva efektívnejšia a šetrnejšia ku kĺbom než dlhé „doskakovanie".</Term>
          <Term name="Aeróbny efekt (0–5)">Garmin skóre po každom behu: koľko tréning dal tvojej vytrvalosti a kondícii. 1–2 = ľahká udržiavacia záťaž, 3–4 = rozvoj kondície, 5 = veľmi náročné.</Term>
          <Term name="Anaeróbny efekt (0–5)">Garmin skóre po každom behu: koľko tréning dal tvojej rýchlosti cez krátke intenzívne úseky nad laktátovým prahom (intervaly, šprinty). Pri Easy a dlhých behoch býva 0 — a tak to má byť. Vyšší vidíš pri Speed a Strength tréningoch.</Term>
        </Item>

        <Item q="Časté chyby začiatočníka">
          <p>• <b className="text-gray-100">Easy behy prirýchlo</b> — chyba č. 1, pokazí regeneráciu aj kľúčové tréningy.</p>
          <p>• <b className="text-gray-100">Vynechávanie ľahkých behov</b> — objem a pravidelnosť robia metódu.</p>
          <p>• <b className="text-gray-100">Prehnaný cieľový čas</b> — celý plán potom beží prirýchlo. Cieľ stanov realisticky podľa nedávnej formy.</p>
          <p>• <b className="text-gray-100">Naháňanie zmeškaných tréningov</b> — radšej pokračuj podľa plánu, nikdy nie 2 tvrdé dni za sebou.</p>
        </Item>

        <Item q="Ako appka funguje">
          <p>
            Appka je nadstavba nad tvojím <b className="text-gray-100">Garmin účtom</b>: číta z neho
            odbehnuté behy a údaje o regenerácii a naspäť do neho zapisuje naplánované tréningy.
            Prepojenie nastavíš raz v{" "}
            <Link href="/settings" className="text-primary underline underline-offset-2">Nastaveniach</Link>
            {" "}(tam zadáš aj variant plánu, cieľový čas a dátum pretekov).
          </p>
          <Term name="Prehľad">
            domovská obrazovka na dnešok: dnešný tréning, odpočet do pretekov, stav formy (spánok,
            Body Battery, HRV, pripravenosť), tréningová záťaž A:C a krátka rada trénera. Odznak
            „Týždeň 5 / 18“ vpravo hore hovorí, v ktorom týždni prípravy si.
          </Term>
          <Term name="Plán">
            celý 18-týždňový oblúk prípravy, tréningy z tvojho Garmin kalendára, detail už
            odbehnutých behov (tempá, tepové zóny, kadencia) a denník zmien plánu. Sú tu aj dve
            akcie trénera: <b className="text-gray-100">Vygenerovať zvyšok týždňa</b> (od dneška do
            nedele) a <b className="text-gray-100">Upraviť najbližší tréning</b> podľa aktuálnej formy.
          </Term>
          <Term name="Reporty">
            posledných 7 dní v číslach a grafoch — nabehané kilometre, spánok, HRV, Body Battery,
            týždenný objem, trend tempa a trendy VO2max, pokojového tepu a A:C záťaže. Slúžia na
            sledovanie, či kondícia rastie.
          </Term>
          <Term name="Tréner">
            chat s AI trénerom. Vidí tvoj profil, plán aj dáta z Garminu, takže sa dá pýtať konkrétne
            („Som unavený, mám trénovať?“, „Zajtra nestíham tréning“).
          </Term>
          <p>
            <b className="text-gray-100">Ako sa tréning dostane do hodiniek:</b> appka ho zapíše do
            tvojho <b className="text-gray-100">Garmin kalendára</b> a hodinky si ho stiahnu pri
            najbližšej synchronizácii s Garmin Connectom. Automaticky sa nezapíše nič — návrh najprv
            uvidíš, môžeš v ňom upraviť názvy, vzdialenosti aj tempá a až potom ho potvrdíš tlačidlom
            <b className="text-gray-100"> „Schváliť a zapísať do Garminu“</b> (pri úprave jedného
            tréningu <b className="text-gray-100">„Schváliť a nahrať“</b>).
          </p>
          <p>
            <b className="text-gray-100">Čo vie AI tréner zmeniť:</b> presunúť tréning na iný deň,
            upraviť alebo zmazať existujúci, vytvoriť a naplánovať nový, zmeniť cieľový čas či dátum
            pretekov a skontrolovať, ktoré tréningy si za posledné dni splnil a ktoré vynechal. Vždy
            napíše, čo urobil — a zmeny nájdeš aj v denníku zmien v Pláne.
          </p>
        </Item>

        <Item q="Slovníček pojmov">
          <p className="text-[13px] text-gray-500 leading-relaxed">
            Rýchle dohľadanie skratiek a pojmov, na ktoré v appke narazíš.
          </p>
          <Term id="pojem-sos" name="SOS">
            „Something of Substance“ — kľúčový, náročný tréning. V týždni sú práve tri: intervaly,
            tempo beh a dlhý beh. Appka podľa nich počíta, ako verne plán plníš.
          </Term>
          <Term id="pojem-hmp" name="HMP">
            Half-Marathon Pace, teda tvoje cieľové pretekové tempo na polmaratón (napr. 5:00 min/km).
            Appka si ho odvodí z cieľového času v Nastaveniach a počíta z neho takmer všetky
            ostatné tempá.
          </Term>
          <Term id="pojem-easy" name="Easy (ľahký beh)">
            pohodlné, „konverzačné“ tempo o 40–75 s/km pomalšie než HMP. Tvorí väčšinu objemu —
            nie je to oddych navyše, ale nástroj regenerácie aj kumulovanej únavy.
          </Term>
          <Term id="pojem-speed" name="Speed (rýchlostné intervaly)">
            krátke rýchle úseky na tvojom aktuálnom 5 km tempe (utorky T2–10). Rozvíjajú VO2max a
            bežeckú ekonomiku.
          </Term>
          <Term id="pojem-strength" name="Strength (silové intervaly)">
            dlhé úseky o 6 s/km rýchlejšie než HMP (utorky T11–17). Učia ťa držať pretekové tempo
            na unavených nohách.
          </Term>
          <Term id="pojem-tempo" name="Tempo (tempový beh)">
            súvislý beh presne na HMP (štvrtky), ktorý sa v pláne postupne predlžuje. Najpodobnejší
            samotným pretekom.
          </Term>
          <Term id="pojem-dlhy-beh" name="Dlhý beh">
            najdlhší beh týždňa (nedele), ale v Easy tempe. Na polmaratón vrcholí okolo 19 km
            (strop 19,5 km) a v plnom tréningovom týždni (aspoň 4 behy) nepresiahne ~30 %
            týždenného objemu. Výnimka: vo variante Just Finish vrcholí ~16 km a pravidlo
            30 % sa neuplatňuje.
          </Term>
          <Term id="pojem-taper" name="Taper">
            posledný týždeň prípravy (T18): objem dole o 50–60 %, počet behov zostáva. Cieľom je
            prísť na štart svieži, nie pridať kondíciu.
          </Term>
          <Term id="pojem-kumulovana-unava" name="Kumulovaná únava">
            zámer trénovať na mierne unavených nohách, aby si si zvykol na pocit zo záveru pretekov.
            Preto sa ti občas nebeží ľahko — a je to v poriadku.
          </Term>
          <Term id="pojem-t" name="T (týždeň prípravy)">
            „T6“ znamená 6. týždeň z 18. Appka ho počíta z dátumu pretekov a podľa neho vie, v akej
            fáze si a aký tréning ti patrí.
          </Term>
          <Term id="pojem-ac-zataz" name="A:C záťaž">
            pomer záťaže za posledných ~7 dní k ~28-dňovému priemeru. 0,8–1,4 = bezpečné pásmo;
            nad 1,4 = priveľa priskoro (riziko preťaženia); pod 0,8 = priestor pridať.
          </Term>
          <Term id="pojem-lthr" name="LTHR (laktátový prah)">
            tep na laktátovom prahu — hranica, nad ktorou už telo nestíha odbúravať laktát. V appke
            slúži len ako strop-poistka (aby Easy nebol prirýchly), nikdy nie ako cieľ behu.
          </Term>
          <Term id="pojem-hrv" name="HRV">
            variabilita srdcového tepu — rozdiely medzi jednotlivými údermi srdca (v ms), ukazovateľ
            regenerácie a stresu. Vyššie a stabilné hodnoty = oddýchnuté telo, prepad často
            predchádza únave alebo chorobe.
          </Term>
          <Term id="pojem-body-battery" name="Body Battery">
            Garmin odhad zásob energie tela (0–100). Ráno vysoké = si nabitý, cez deň prirodzene klesá.
          </Term>
          <Term id="pojem-pripravenost" name="Pripravenosť">
            Garmin skóre (0–100), ako je telo dnes pripravené na záťaž (zo spánku, HRV a únavy).
            Nízke = zvoľ ľahší tréning.
          </Term>
          <Term id="pojem-vo2max" name="VO2max">
            odhad maximálnej spotreby kyslíka (ml/kg/min) — koľko kyslíka telo dokáže využiť pri
            najvyššej záťaži. Vyššie = lepšia aeróbna kondícia. Appka z neho odhaduje tvoje aktuálne
            5 km tempo pre Speed intervaly (Advanced/Beginner).
          </Term>
          <Term id="pojem-gap" name="GAP">
            Grade Adjusted Pace — tempo prepočítané, akoby si bežal po rovine. Vďaka nemu vidno, či
            za pomalším tempom bol kopec alebo naozaj slabší deň.
          </Term>
          <Term id="pojem-decoupling" name="Decoupling">
            o koľko percent klesla tvoja ekonomika (pomer tempa a tepu) v druhej polovici behu oproti
            prvej. Pod 5 % = výborná aeróbna báza, nad 8 % = výrazný drift (únava, teplo, slabšia báza).
          </Term>
          <Term id="pojem-kadencia" name="Kadencia">
            počet krokov za minútu (spm, steps per minute). Vyššia kadencia (~170–180) býva
            efektívnejšia a šetrnejšia ku kĺbom než dlhé „doskakovanie“.
          </Term>
          <Term id="pojem-treningovy-efekt" name="Aeróbny a anaeróbny efekt">
            Garmin skóre 0–5 po každom behu. Aeróbny hovorí, koľko tréning dal tvojej vytrvalosti a
            kondícii; anaeróbny koľko rýchlosti cez krátke intenzívne úseky nad laktátovým prahom.
            Pri Easy a dlhých behoch býva anaeróbny 0 — a tak to má byť.
          </Term>
          <Term id="pojem-tep-zotavenia" name="Tep zotavenia (HRR)">
            o koľko úderov klesne tvoj tep do ~2 minút po dobehnutí. Väčší pokles = lepšia
            regenerácia a kondícia. Garmin ho meria len vtedy, keď si ho po tréningu spustíš ručne,
            takže ho neuvidíš pri každom behu.
          </Term>
        </Item>
      </div>
    </div>
  );
}
