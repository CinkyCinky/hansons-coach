// Cviky pre dynamickú rozcvičku (pred behom) a strečing (po behu).
// Zdroj rozcvičky: dynamický warm-up protokol Luka Humphreyho (Hansons Half-Marathon
// Method). Strečing po behu Hanson detailne nepredpisuje — sú to štandardné bežecké
// strečingy zamerané na svaly najviac zaťažené behom.
// Dáta žijú čisto na frontende (žiadny backend) a sú v slovenčine, vrátane krokov a
// vysvetlenia účelu, aby cvik zvládol aj úplný začiatočník.

export type WarmupPhase = "before" | "after";

export interface Exercise {
  id: string;
  icon: string;          // emoji – ľahká vizuálna pomôcka
  name: string;
  muscles: string;       // cieľové svaly (krátky štítok)
  dose: string;          // dávka, napr. "10 opakovaní na nohu"
  durationSec?: number;  // ak ide o statický strečing → spustí sa časovač
  steps: string[];       // 2–3 konkrétne kroky „čo presne robiť"
  why: string;           // na čo je cvik a prečo pomáha
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
      "Postav sa vzpriamene a rozpaž ruky do strán do výšky ramien.",
      "Krúž pažami dopredu — 10 plynulých kruhov, potom 10 dozadu.",
      "Pohyb veď pomaly, akoby si vo vzduchu kreslil veľké kruhy.",
    ],
    why: "Zahreje ramenné kĺby a uvoľní horný chrbát — pomáha držať uvoľnený bežecký postoj a prácu paží.",
  },
  {
    id: "trunk-rotations",
    icon: "🌀",
    name: "Rotácie trupu",
    muscles: "Driek · bedrá",
    dose: "10 opak. / smer",
    steps: [
      "Stoj na šírku ramien a polož si ruky na boky.",
      "Krúž bokmi do veľkého kruhu — 10× v smere hodinových ručičiek.",
      "Zopakuj 10× opačným smerom. Trup drž vzpriamený, pohyb veď z bedier.",
    ],
    why: "Uvoľní driek a bedrové kĺby a predíde stuhnutiu počas dlhšieho behu.",
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
  },
  {
    id: "leg-swings-side",
    icon: "↔️",
    name: "Švihy nohou do strán",
    muscles: "Stehná · bedro",
    dose: "10 opak. / nohu",
    steps: [
      "Pridrž sa steny a jednu nohu zdvihni mierne nad zem.",
      "Švihaj ňou nabok a späť cez os tela — ako metronóm.",
      "Trup drž stabilný, nenakláňaj sa do strany.",
    ],
    why: "Aktivuje stabilizátory bedra, ktoré pri behu udržiavajú koleno v správnej osi.",
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
  },
];

export function exercisesFor(phase: WarmupPhase): Exercise[] {
  return phase === "before" ? WARMUP_BEFORE : STRETCH_AFTER;
}
