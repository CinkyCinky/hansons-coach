// Cviky pre dynamickú rozcvičku (pred behom) a strečing (po behu).
// Zdroj rozcvičky: dynamický warm-up protokol Luka Humphreyho (Hansons Half-Marathon
// Method). Strečing po behu Hanson detailne nepredpisuje — sú to štandardné bežecké
// strečingy zamerané na svaly najviac zaťažené behom.
// Dáta žijú čisto na frontende (žiadny backend) a sú v slovenčine, vrátane krokov a
// vysvetlenia účelu, aby cvik zvládol aj úplný začiatočník.

export type WarmupPhase = "before" | "after" | "strength";

export interface Exercise {
  id: string;
  icon: string;          // emoji – ľahká vizuálna pomôcka
  name: string;
  muscles: string;       // cieľové svaly (krátky štítok)
  dose: string;          // dávka, napr. "10 opakovaní na nohu"
  durationSec?: number;  // ak ide o statický strečing/výdrž → spustí sa časovač
  steps: string[];       // 2–3 konkrétne kroky „čo presne robiť"
  why: string;           // na čo je cvik a prečo pomáha
  mistake?: string;      // najčastejšia chyba — na čo si dať pozor
  videoQuery?: string;   // ak je uvedené, UI ukáže odkaz na referenčné video
}

// Odkaz na referenčné video — YouTube vyhľadávanie podľa (anglického) názvu cviku.
// Zámerne vyhľadávanie, nie konkrétne video ID: nikdy sa nerozbije na „video zmazané".
export function videoUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

// ── Dynamická rozcvička PRED behom (10 cvikov, ~8 min) ────────────────────────
export const WARMUP_BEFORE: Exercise[] = [
  {
    id: "arm-circles",
    icon: "🔄",
    name: "Kruhy pažami",
    muscles: "Ramená",
    dose: "10 opak. / smer",
    steps: [
      "Postav sa vzpriamene, nohy na šírku bokov, a rozpaž vystreté ruky do strán do výšky ramien.",
      "Krúž pažami dopredu — 10 plynulých kruhov, potom 10 dozadu.",
      "Začni menšími kruhmi a postupne ich zväčšuj, akoby si vo vzduchu kreslil veľké kolesá.",
    ],
    why: "Zahreje a prekrví ramenné kĺby a uvoľní horný chrbát. Pri behu ruky udávajú rytmus a rovnováhu — uvoľnené ramená znamenajú menej zbytočného napätia a ekonomickejší beh.",
    mistake: "Nehrb ramená k ušiam a nezadržiavaj dych — ramená nechaj stiahnuté dole, pohyb veď plynulo, nie trhane.",
    videoQuery: "arm circles warm up exercise how to",
  },
  {
    id: "trunk-rotations",
    icon: "🌀",
    name: "Rotácie trupu",
    muscles: "Driek · bedrá",
    dose: "10 opak. / smer",
    steps: [
      "Stoj na šírku ramien, mierne pokrč kolená a polož si ruky na boky.",
      "Krúž bokmi do veľkého kruhu — 10× v smere hodinových ručičiek.",
      "Zopakuj 10× opačným smerom. Hrudník a hlavu drž vzpriamené, pohyb veď z bedier.",
    ],
    why: "Rozhýbe a prekrví driek a bedrové kĺby. Uvoľnená panva dovolí plynulejší a dlhší krok a predíde stuhnutiu a bolesti chrbta počas dlhšieho behu.",
    mistake: "Nekrúž celým trupom ani ramenami — hýbu sa boky, hrudník ostáva relatívne na mieste. Rob to pomaly, bez švihu.",
    videoQuery: "standing hip trunk rotations warm up",
  },
  {
    id: "leg-swings-front",
    icon: "🦵",
    name: "Švihy nohou dopredu a dozadu",
    muscles: "Hamstringy · bedro",
    dose: "10 opak. / nohu",
    steps: [
      "Postav sa bokom k stene a jednou rukou sa zľahka pridrž.",
      "Voľnou nohou švihaj dopredu a dozadu ako kyvadlo.",
      "Pohyb veď plynulo z bedrového kĺbu, koleno nechaj uvoľnené.",
    ],
    why: "Rozhýbe bedrový kĺb a zahreje hamstringy — kľúčové svaly, ktoré ťa pri behu poháňajú.",
    mistake: "Nešvihaj silou ani cez bolesť — pohyb veď plynulo z bedra, trup nechaj vzpriamený a nehojdaj sa.",
    videoQuery: "leg swings front to back running drill",
  },
  {
    id: "leg-swings-side",
    icon: "↔️",
    name: "Švihy nohou do strán",
    muscles: "Stehná · bedro",
    dose: "10 opak. / nohu",
    steps: [
      "Postav sa čelom k stene a oboma rukami sa zľahka pridrž.",
      "Jednou nohou švihaj nabok od tela a späť pred druhú nohu — plynule ako metronóm.",
      "Trup drž vzpriamený a stabilný, nenakláňaj sa do strany. Potom vymeň nohy.",
    ],
    why: "Rozhýbe bedro do strán a aktivuje bočné stabilizátory panvy (gluteus medius), ktoré pri každom kroku držia koleno v správnej osi — dôležitá prevencia bolesti kolena a IT pásu.",
    mistake: "Nešvihaj silou do krajnej polohy ani cez bolesť — pohyb veď kontrolovane z bedra a nehojdaj celým telom.",
    videoQuery: "lateral leg swings running drill",
  },
  {
    id: "walking-lunges",
    icon: "🚶",
    name: "Výpady v chôdzi",
    muscles: "Stehná · zadok",
    dose: "10 krokov vpred",
    steps: [
      "Vykroč dopredu — predné koleno nech je presne nad špičkou, nie pred ňou.",
      "Zadné koleno spúšťaj k zemi, ale nedotkni sa ňou.",
      "Odtlač sa prednou nohou a plynulo vykroč ďalej. Trup drž vzpriamený.",
    ],
    why: "Naraz zahreje celé dolné telo — najdôležitejší cvik rozcvičky. Dbaj na správnu os kolena.",
    mistake: "Predné koleno nesmie prejsť za špičku ani padať dovnútra — smeruje presne nad chodidlo.",
    videoQuery: "walking lunges exercise proper form",
  },
  {
    id: "slow-skip",
    icon: "🦘",
    name: "Pomalý skiping",
    muscles: "Lýtka · koordinácia",
    dose: "30 m vpred",
    steps: [
      "Skáč pomaly vpred a striedavo dvíhaj koleno aspoň do výšky bedier.",
      "Odrážaj sa z prednej časti chodidla, nie z päty.",
      "Pažami pracuj synchrónne: ľavá ruka — pravá noha a naopak.",
    ],
    why: "Naladí pohybové vzorce behu a zahreje lýtka — príprava na správnu bežeckú techniku.",
    mistake: "Nerob to rýchlo ani nízko — koleno hore, odraz z prednej časti chodidla, nedopadaj na pätu.",
    videoQuery: "A skip running drill technique",
  },
  {
    id: "high-knees",
    icon: "🏃",
    name: "Vysoké kolená",
    muscles: "Bedrá · lýtka",
    dose: "30 m vpred",
    steps: [
      "Bež vpred a v každom kroku vystreľ koleno čo najvyššie — aspoň do výšky bedier.",
      "Drž svižné tempo a aktívne pracuj pažami.",
      "Trup drž vzpriamený, nenakláňaj sa dozadu.",
    ],
    why: "Prebudí bedrové ohýbače a nervovo-svalový systém pri vyššej intenzite behu.",
    mistake: "Nenakláňaj sa dozadu — trup drž vzpriamený, koleno vystreľ hore a aktívne pracuj rukami.",
    videoQuery: "high knees running drill technique",
  },
  {
    id: "butt-kicks",
    icon: "🦶",
    name: "Päty k zadku",
    muscles: "Hamstringy",
    dose: "30 m vpred",
    steps: [
      "Bež vpred a pätami sa v každom kroku dotýkaj zadku.",
      "Tempo drž rýchle, kolená smerujú dolu, nie dopredu.",
      "Trup drž vzpriamený a aktívne pracuj pažami.",
    ],
    why: "Zvýši frekvenciu krokov a zahreje hamstringy — vhodná protiváha k vysokým kolenám.",
    mistake: "Kolená smerujú dolu, nie dopredu — inak z toho je len kopanie a hamstringy sa nezahrejú.",
    videoQuery: "butt kicks running drill technique",
  },
  {
    id: "bounders",
    icon: "💨",
    name: "Poskoky",
    muscles: "Zadok · odraz",
    dose: "30 m vpred",
    steps: [
      "Spoj skiping a vysoké kolená: koleno hore a zároveň silný odraz z odrazovej nohy.",
      "Každý krok je malý skok vpred — dôraz daj na odraz, nie na rýchlosť.",
      "Tempo nechaj pomalšie ako pri iných cvikoch — dôležitá je kvalita pohybu.",
    ],
    why: "Trénuje výbušnú silu odrazu — základ ekonomického a pružného behu.",
    mistake: "Nejde o rýchlosť ani maximálnu výšku — dôraz daj na kvalitný odraz a mäkké, tiché dopadnutie.",
    videoQuery: "bounding running drill technique",
  },
  {
    id: "strides",
    icon: "⚡",
    name: "Rovinky",
    muscles: "Celé telo",
    dose: "4–6 × 75 m",
    steps: [
      "Postupne zrýchľuj až na zhruba 90 % svojho maxima — nie naplno hneď.",
      "Posledných 20 m drž rýchlosť a potom pozvoľna spomaľ.",
      "Medzi rovinkami daj 30–60 s pokojnej chôdze na zotavenie.",
    ],
    why: "Naštartuje nervový systém a doladí techniku. Mimoriadne dôležité pred Speed a Strength tréningom.",
    mistake: "Nezačínaj naplno a nie je to šprint — plynulo zrýchľuj do svižného, ale uvoľneného behu.",
    videoQuery: "running strides technique how to",
  },
];

// ── Strečing PO behu (6 cvikov, ~7 min) ───────────────────────────────────────
export const STRETCH_AFTER: Exercise[] = [
  {
    id: "calf-stretch",
    icon: "🦵",
    name: "Strečing lýtok",
    muscles: "Lýtko",
    dose: "30 s / nohu",
    durationSec: 30,
    steps: [
      "Postav sa čelom k stene, jednu nohu posuň dozadu a pätu pevne pritlač k zemi.",
      "Zľahka sa opri o stenu, kým v lýtku zadnej nohy neucítiš ťah.",
      "Drž bez hojdania. Potom vymeň nohy.",
    ],
    why: "Lýtka sú pri behu mimoriadne zaťažené — pravidelný strečing predchádza zápalu Achillovej šľachy.",
    mistake: "Pätu zadnej nohy nedvíhaj a nehojdaj sa — pätu drž pevne pri zemi a do ťahu sa opieraj plynulo, bez pruženia.",
    videoQuery: "standing calf stretch against wall",
  },
  {
    id: "hamstring-stretch",
    icon: "🧘",
    name: "Strečing hamstringov",
    muscles: "Zadné stehno",
    dose: "30 s / nohu",
    durationSec: 30,
    steps: [
      "Sadni si na zem, jednu nohu vystri, druhú pokrč nabok k telu.",
      "Pomaly sa predkláňaj k vystretej nohe — chrbát drž čo najrovnejší, nie zaguľatený.",
      "Zastav sa tam, kde cítiš ťah, a drž bez hojdania.",
    ],
    why: "Skrátené hamstringy skracujú krok a zaťažujú driek — jeden z najdôležitejších strečingov pre bežca.",
    mistake: "Nezaguľacuj chrbát pri predklone — vychádzaj z bedier a chrbát drž rovný, inak ťah cítiš v drieku, nie v hamstringu.",
    videoQuery: "seated hamstring stretch proper form",
  },
  {
    id: "quad-stretch",
    icon: "🧎",
    name: "Strečing štvorhlavého svalu",
    muscles: "Predné stehno",
    dose: "30 s / nohu",
    durationSec: 30,
    steps: [
      "Postav sa a pre istotu sa pridrž steny. Pokrč koleno a chyť sa za členok.",
      "Pritiahni pätu k zadku, kolená drž vedľa seba.",
      "Ťah cítiš vpredu na stehne. Telo nepredkláňaj.",
    ],
    why: "Štvorhlavý sval tlmí nárazy pri behu a býva u väčšiny bežcov chronicky napätý.",
    mistake: "Neprehýbaj sa v drieku a nerozťahuj kolená od seba — kolená drž vedľa seba, zadok jemne podsaď a telo drž vzpriamené.",
    videoQuery: "standing quad stretch technique",
  },
  {
    id: "hip-flexor-stretch",
    icon: "🏋️",
    name: "Strečing bedrového ohýbača",
    muscles: "Bedro · slabina",
    dose: "30 s / nohu",
    durationSec: 30,
    steps: [
      "Kľakni si na jedno koleno ako rytier — predné koleno zvieraj v pravom uhle.",
      "Posuň panvu mierne dopredu, kým v slabine zadnej nohy neucítiš ťah.",
      "Pre väčší ťah zdvihni ruku nad hlavu.",
    ],
    why: "Sedenie cez deň skracuje bedrové ohýbače — skrátené znamenajú kratší krok a bolesť drieku.",
    mistake: "Nepreháňaj predklon panvy do bolesti drieku — panvu podsaď (zadok zovri) a posúvaj sa vpred jemne.",
    videoQuery: "kneeling hip flexor stretch",
  },
  {
    id: "it-band-stretch",
    icon: "↗️",
    name: "Strečing IT pásu",
    muscles: "Vonkajšie stehno",
    dose: "30 s / nohu",
    durationSec: 30,
    steps: [
      "Postav sa a skríž jednu nohu za druhú.",
      "Nakláňaj sa do strany k prednej nohe, ruky môžeš dvíhať nad hlavu.",
      "Ťah cítiš na vonkajšej strane stehna.",
    ],
    why: "Syndróm IT pásu patrí k najčastejším zraneniam bežcov — pravidelný strečing je najlepšia prevencia.",
    mistake: "Nepredkláňaj sa dopredu — nakláňaj sa čisto do strany (bok tlač von) a nepruž; ťah má byť na vonkajšej strane stehna a bedra.",
    videoQuery: "standing IT band stretch",
  },
  {
    id: "glute-stretch",
    icon: "🛌",
    name: "Strečing sedacieho svalu (figúra 4)",
    muscles: "Zadok",
    dose: "30 s / stranu",
    durationSec: 30,
    steps: [
      "Ľahni si na chrbát s pokrčenými kolenami. Jeden členok polož na druhé koleno — vznikne tvar štvorky.",
      "Chyť sa za stehno spodnej nohy a pritiahni ju k hrudi.",
      "Ťah cítiš hlboko v zadku. Potom vymeň strany.",
    ],
    why: "Sedacie svaly stabilizujú beh. Napätý piriformis môže tlačiť na sedací nerv — strečing predchádza bolesti zadku a nohy.",
    mistake: "Nedvíhaj hlavu ani ramená k nohe — hlavu nechaj ležať, ťah vytváraš priťahovaním stehna k hrudi, nie zdvíhaním trupu.",
    videoQuery: "figure 4 glute stretch lying down",
  },
];

// ── Silový / voľný deň (voliteľné, ~15–20 min) ────────────────────────────────
// Hanson odporúča doplnkovú silovú a mobilizačnú prácu 1–2× týždenne na ľahký/voľný
// deň (NIE pred kľúčovým behom). Bez náradia, s vlastnou váhou. Cieľ: silnejší core,
// zadok a jednonohá stabilita = ekonomickejší beh a menej zranení. Rob to pokojne —
// nemá to byť ďalší tvrdý tréning.
export const STRENGTH_OPTIONAL: Exercise[] = [
  {
    id: "plank",
    icon: "🪵",
    name: "Doska (plank)",
    muscles: "Core · brucho",
    dose: "3× 30–45 s",
    durationSec: 40,
    steps: [
      "Opri sa o predlaktia a špičky nôh, telo drž v jednej priamke od hlavy po päty.",
      "Spevni brucho a zovri zadok (akoby ťa mal niekto štuchnúť do brucha), panvu podsaď.",
      "Dýchaj plynulo a drž. Potom si daj ~30 s pauzu a zopakuj.",
    ],
    why: "Silný stred tela drží pri behu stabilnú panvu a chrbticu — menej rozpadu formy v závere a menej bolesti drieku.",
    mistake: "Neprepadávaj sa v drieku ani nedvíhaj zadok hore — telo je rovná doska, nie „véčko“ ani hojdačka.",
    videoQuery: "forearm plank proper form",
  },
  {
    id: "side-plank",
    icon: "🧱",
    name: "Bočná doska",
    muscles: "Boky · šikmé brušné",
    dose: "3× 30 s / stranu",
    durationSec: 30,
    steps: [
      "Ľahni si na bok, opri sa o predlaktie (lakeť pod ramenom), nohy vystri na seba.",
      "Zdvihni boky, kým telo nie je rovná priamka — panvu tlač hore a vpred.",
      "Drž bez klesania, potom vymeň stranu.",
    ],
    why: "Posilní bočné stabilizátory panvy — tie držia koleno v osi a bránia „prepadávaniu“ bedra pri každom kroku.",
    mistake: "Neklesaj bokmi k zemi a nepadaj dopredu/dozadu — telo drž v jednej rovine.",
    videoQuery: "side plank exercise proper form",
  },
  {
    id: "glute-bridge",
    icon: "🌉",
    name: "Mostík (glute bridge)",
    muscles: "Zadok · hamstringy",
    dose: "3× 12–15",
    steps: [
      "Ľahni si na chrbát, kolená pokrč, chodidlá na šírku bokov opri o zem.",
      "Zovri zadok a zdvihni panvu, kým telo od kolien po ramená nie je priamka.",
      "Hore na chvíľu zadrž, potom sa pomaly spusti. Dole úplne neodpočívaj.",
    ],
    why: "Aktivuje a posilní zadok — najsilnejší „motor“ behu. Slabý zadok preťažuje hamstringy a driek.",
    mistake: "Nedvíhaj sa cez driek (neprehýbaj chrbticu) — pohyb vedie zovretie zadku, nie prehnutie drieku.",
    videoQuery: "glute bridge exercise proper form",
  },
  {
    id: "clamshell",
    icon: "🐚",
    name: "Mušľa (clamshell)",
    muscles: "Bočný zadok · bedro",
    dose: "3× 15 / stranu",
    steps: [
      "Ľahni si na bok, kolená pokrč do ~90°, jedno na druhom, päty spolu.",
      "Bez otáčania panvy roztvor horné koleno nahor (ako mušľa) — päty ostávajú spolu.",
      "Pomaly spusti späť. Pohyb rob kontrolovane, nie švihom.",
    ],
    why: "Cieli malý sval na boku zadku (gluteus medius), ktorý drží koleno v osi — prevencia bolesti kolena a IT pásu.",
    mistake: "Nepreklápaj panvu dozadu, len aby si zdvihol koleno vyššie — radšej menší, ale čistý pohyb.",
    videoQuery: "clamshell exercise glute medius",
  },
  {
    id: "bird-dog",
    icon: "🐦",
    name: "Vták-pes (bird-dog)",
    muscles: "Core · chrbát · zadok",
    dose: "3× 10 / stranu",
    steps: [
      "Kľakni si na štyri (ruky pod ramenami, kolená pod bedrami), chrbát rovný.",
      "Súčasne vystri opačnú ruku dopredu a nohu dozadu do priamky s telom.",
      "Na chvíľu zadrž, vráť sa a vymeň strany. Panvu drž stabilnú (nekrúť ňou).",
    ],
    why: "Učí telo držať stabilný trup, kým sa končatiny hýbu — presne to, čo beh vyžaduje. Skvelé pre driek.",
    mistake: "Neprehýbaj sa v drieku a nekrúť panvou — predstav si pohár vody na drieku, ktorý nesmie spadnúť.",
    videoQuery: "bird dog exercise proper form",
  },
  {
    id: "dead-bug",
    icon: "🐛",
    name: "Mŕtvy chrobák (dead bug)",
    muscles: "Hlboký core",
    dose: "3× 10 / stranu",
    steps: [
      "Ľahni si na chrbát, ruky vystri kolmo hore, kolená a bedrá pokrč do ~90°.",
      "Driek pritlač do zeme a pomaly spusti opačnú ruku a nohu k zemi.",
      "Vráť sa a vymeň strany. Pomaly, s výdychom pri spúšťaní.",
    ],
    why: "Posilní hlboký stred tela bez zaťaženia chrbtice — bezpečný základ stability pre bežca.",
    mistake: "Driek sa nesmie odlepiť od zeme — ak sa dvíha, spúšťaj končatiny menej, kým to zvládneš čisto.",
    videoQuery: "dead bug core exercise proper form",
  },
  {
    id: "split-squat",
    icon: "🏋️",
    name: "Bulharský drep (na jednej nohe)",
    muscles: "Stehná · zadok",
    dose: "3× 8–10 / nohu",
    steps: [
      "Stoj chrbtom ku gauču/stoličke, priehlavok zadnej nohy polož na sedadlo za sebou.",
      "Pokrč prednú nohu a spúšťaj sa rovno dole, kým predné stehno nie je ~vodorovne.",
      "Odtlač sa cez pätu prednej nohy hore. Trup drž vzpriamený.",
    ],
    why: "Jednonohá sila je behu bližšie než obojnožný drep — vyrovná rozdiely medzi nohami a spevní koleno.",
    mistake: "Predné koleno nesmie padať dovnútra ani ísť ďaleko za špičku — váhu drž na päte prednej nohy.",
    videoQuery: "bulgarian split squat proper form",
  },
  {
    id: "single-leg-calf-raise",
    icon: "🦵",
    name: "Výpony na jednej nohe",
    muscles: "Lýtko · Achillovka",
    dose: "3× 12–15 / nohu",
    steps: [
      "Postav sa na jednu nohu (druhú zohni), zľahka sa pridrž steny pre rovnováhu.",
      "Pomaly sa vytiahni čo najvyššie na špičku, na vrchu na chvíľu zadrž.",
      "Ešte pomalšie sa spusti dole — pomalé spúšťanie je kľúč.",
    ],
    why: "Silné lýtka a Achillovka absorbujú náraz pri každom kroku — najlepšia prevencia najčastejších zranení lýtka a šľachy.",
    mistake: "Nespúšťaj sa rýchlo/padaním — väčšinu efektu robí pomalé, kontrolované spúšťanie.",
    videoQuery: "single leg calf raise exercise",
  },
];

export function exercisesFor(phase: WarmupPhase): Exercise[] {
  if (phase === "before") return WARMUP_BEFORE;
  if (phase === "after") return STRETCH_AFTER;
  return STRENGTH_OPTIONAL;
}
