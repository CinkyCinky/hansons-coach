# Hansonova polmaratónová metóda — referencia + návrh prepracovania appky

> Stav: návrh (2026-06). Zdrojom právd pre tréningovú logiku appky má byť tento dokument.
> Overené z verejných zdrojov (Luke Humphrey Running, Hansons Coaching, Outside/Run,
> coaching blogy) — odkazy na konci. Označené sú aj miesta, kde sa naša pôvodná
> `hansons_knowledge.py` mýlila.

---

## ČASŤ 1 — Hansonova polmaratónová metóda (overené)

### 1.1 Filozofia: kumulovaná únava (Cumulative Fatigue)
Jadro metódy (prevzaté z Lydiarda). Trénuje sa tak, aby telo nikdy nebolo plne
zregenerované — beháme na „mŕtvych nohách", aby sme si zvykli na záver pretekov.
Dôsledky:
- **Objem a konzistencia > jeden hrdinský dlhý beh.** 6 dní behu/týždeň + 1 deň úplné voľno.
- **Easy behy nie sú „voľno navyše"** — sú nástroj regenerácie aj budovania únavy.
- Žiadny tréning sa nerobí úplne oddýchnutý; to je zámer.

### 1.2 Plány, dĺžka, objem
- Tri varianty: **Beginner, Advanced, Just Finish.** Všetky **18 týždňov**, **6 dní behu** + 1 voľno.
- Vrchol objemu: **~48 míľ/týž (Beginner) – ~51 míľ/týž (Advanced)** (~77–82 km).
- „Just Finish" = bez tvrdých intervalov, len dobeh.

### 1.3 Týždenná štruktúra (rozloženie SOS)
Tri „SOS" tréningy (Something of Substance), nikdy nie 2 tvrdé dni za sebou:
| Deň | Tréning |
|---|---|
| Pondelok | Easy alebo voľno |
| **Utorok** | **SOS — Speed (T1–~T10) / Strength (~T11–T17) intervaly** |
| Streda | Easy alebo voľno |
| **Štvrtok** | **SOS — Tempo beh @ cieľové polmaratónové tempo** |
| Piatok | Easy |
| Sobota | Easy |
| **Nedeľa** | **SOS — Dlhý beh (Easy tempom)** |

> Pozn.: dni nie sú dogma — dôležité je poradie (easy medzi SOS) a že SOS sú práve 3.

### 1.4 Typy behov a tempá (DÔLEŽITÉ — verzia pre POLMARATÓN)

| Typ | Tempo / intenzita | Z čoho sa odvodzuje |
|---|---|---|
| **Easy** | „comfortable, conversational"; ~**+1 až +2 min/míľu** nad cieľom (≈ +40–75 s/km) | cieľové HMP + offset; riadené **TEMPOM** (nie tepom) |
| **Speed** (intervaly, T~2–10) | **aktuálne 5K tempo** | **AKTUÁLNA forma** (posledné preteky / 5K–10K), NIE cieľ |
| **Strength** (intervaly, T~11–17) | **cieľové HMP − 10 s/míľu** (≈ −6 s/km) | cieľový polmaratónový čas |
| **Tempo** (štvrtok) | **presne cieľové HMP** | cieľový polmaratónový čas |
| **Long** (nedeľa) | **Easy tempo** (nie pretekové) | ako Easy |
| **Warm-up / Cool-down** | spodný okraj Easy tempa | ako Easy |

**Opravy oproti našej pôvodnej `hansons_knowledge.py`:**
1. ❌ „Easy riadime tepom" → ✅ **Hanson riadi Easy TEMPOM**; tep je len doplnková referencia (viď 1.8).
2. ❌ „Strength = 10K tempo (HMP −10 až −15 s/km)" → ✅ **Strength = cieľové HMP − 10 s/míľu (≈ −6 s/km)** — výrazne miernejšie, než sme mali.
3. ❌ Speed odvodené z cieľa → ✅ **Speed sa kotví na AKTUÁLNU 5K formu**, nie na cieľ.
4. ❌ WU/CD fix 1.5 míle → ✅ **WU/CD = rozsah 1–3 míle** (viď 1.6).

### 1.5 Progresie tréningov (Advanced plán; orientačné, z oficiálneho plánu)
**SPEED fáza @ 5K tempo (utorky), WU+CD okolo:**
```
T2: 12×400m   T3: 8×600m    T4: 6×800m    T5: 5×1000m   T6: 4×1200m
T7: 3×1míľa   T8: 5×1000m   T9: 6×800m    T10: 12×400m
```
Pauzy: krátky klus (400–600m podľa dĺžky úseku).

**STRENGTH fáza @ HMP−10 s/míľu (utorky):**
```
T11: 6×1míľa  T12: 4×1.5míle  T13: 3×2míle  T14: 2×3míle  T15: 3×2míle
T16: 4×1.5míle  T17: 6×1míľa
```
Pauzy: 400–800m klus.

**TEMPO @ HMP (štvrtky), progresívne:** 3 → 4 → 5 → 6 → 7 míľ, v závere taper na ~5 míľ.

**LONG (nedeľa) @ Easy:** buduje sa 10 → 12 → 14 (max) míľ; **nikdy > 25–30 % týždenného objemu** a **strop ~16 míľ**.

### 1.6 Warm-up a cool-down
- **Len pri SOS** (Speed/Strength/Tempo). Easy a Dlhé behy ich **nemajú**.
- **Dĺžka = rozsah ~1–3 míle (≈ 1.6–4.8 km) každý**, nie fixne 1.5 míle. Reálne príklady z plánov: ~1.7 mi WU / ~1.1 mi CD.
- Tempo WU/CD = **spodný okraj Easy** (pomaly).
- Praktické pravidlo pre nás: škálovať podľa dĺžky hlavnej časti (kratšie sedenie → ~2 km, dlhé tempo → ~3 km).

### 1.7 Taper (T18)
- Výrazné zníženie objemu (~50–60 % vrcholu), zachovať frekvenciu.
- Žiadne nové vzdialenosti, žiadne tvrdé intervaly; max 1 krátky beh s pár HMP úsekmi.
- Priorita: spánok, sacharidy, hydratácia.

### 1.8 Srdcový tep v Hansonovi (overené stanovisko Humphreyho)
- Metóda je **založená na TEMPE, nie na tepe.** Humphrey: *„keď budú rozdávať
  kvalifikácie na Boston podľa tepu, začnem trénovať podľa tepu."*
- Tep **nepoužívať ako riadiaci cieľ počas behu** (cardiac drift, oneskorenie, denná
  variabilita → „otrok parametra").
- Legitímne použitie tepu: **referencia po behu** (trendy formy), **ranný pokojový tep /
  HRV** na detekciu preťaženia, a ako **strop-poistka**, aby Easy nebol pribrzdený/prehnaný.
- Záver pre nás: **tempo = primárny cieľ pre všetky behy**; tep = sekundárna referencia.

### 1.9 Zdroje
- Luke Humphrey – Updated thoughts on heart rate: https://lukehumphreyrunning.com/updated-thoughts-on-heart-rate/
- Hansons running calculator (tempá): https://lukehumphreyrunning.com/hmmcalculator/
- Tempo Workouts The Hansons Way (Outside): https://run.outsideonline.com/training/workouts/tempo-workouts-the-hansons-way/
- Laura Norris Running – Hansons Half Marathon Method: https://lauranorrisrunning.com/hansons-half-marathon-method/
- Fellrnr – Hanson method: https://fellrnr.com/wiki/Hanson
- Matthew Boyd Physio – prehľad: https://matthewboydphysio.com/hansons-marathon-method/

---

## ČASŤ 2 — Návrh AI trénera (verný Hansonovi + maximálne využíva Garmin dáta)

### 2.1 Hlavný princíp: deterministické jadro + LLM na uvažovanie
Dnes počíta tempá aj štruktúru tréningu samotný LLM z promptu → nestabilné, ťažko
overiteľné, náchylné na odchýlky. Návrh: **rozdeliť zodpovednosti.**

- **Deterministický kód (Python) = „čísla a štruktúra"** — single source of truth:
  - výpočet všetkých temp (Easy/Speed/Strength/Tempo) podľa 1.4,
  - výber správneho SOS pre daný týždeň podľa fázy a progresií (1.5),
  - WU/CD dĺžky, pauzy, objem, strop dlhého behu,
  - guardraily (long ≤ 30 % objemu, nie 2 tvrdé dni za sebou).
- **LLM = „mozog a komunikácia"**:
  - prispôsobenie dennej forme (zmäkčenie/presun) na základe wellness dát,
  - rozhodnutia pri konfliktoch (zmeškané SOS, dostupné dni, zranenie z poznámok),
  - slovenský komentár „prečo" + konverzácia v chate.

Výsledok: tempá a štruktúra sú **vždy presné a Hanson-konzistentné**, LLM len rozhoduje
„čo a kedy" v medziach pravidiel.

### 2.2 Vstupné dáta z Garminu a ako ich použiť
| Dáta | Použitie |
|---|---|
| **Aktuálna 5K/10K forma** (posledné preteky, VO2max, najlepšie tempá) | tempo **Speed** intervalov (kotva na realitu) |
| **Cieľový čas** (profil) | **Strength, Tempo, Easy, Long** tempá |
| **LTHR + bežecké HR zóny** (sport=RUNNING) | **HR-referencia/strop** (nie cieľ); kontrola realistickosti cieľa |
| **VO2max** | odhad aktuálnej formy → realistickosť cieľa, ladenie Speed |
| **Wellness: Body Battery, HRV, pripravenosť, spánok** | denné zmäkčenie/presun SOS |
| **A:C záťaž (acute:chronic)** | >1.4 → uber objem/intenzitu |
| **História aktivít + naplánované tréningy** | compliance (zmeškané SOS), reálne odbehnuté tempá, týždenný objem |
| **Časová os (štart, preteky, fáza)** | správna fáza (Speed/Strength/Taper), zhustenie pri krátkej príprave |

### 2.3 Algoritmus tvorby týždenného plánu (návrh)
1. Urči **fázu** podľa týždňa prípravy (pondelkové zarovnanie — už hotové).
2. Vyber **SOS šablónu** týždňa (Speed/Strength ladder, Tempo dĺžka, Long dĺžka) z 1.5.
3. **Rozmiestni SOS** na dostupné dni (z profilu/UI), drž pravidlo „easy medzi SOS";
   ak preferovaný deň nie je dostupný, presuň na najbližší vhodný.
4. **Dopočítaj tempá** deterministicky (Speed z aktuálnej formy, zvyšok z cieľa).
5. **Doplň Easy behy** na zvyšné dni do cieľového týždenného objemu (fáza-špecifický).
6. **Aplikuj guardraily** (long ≤ 30 % objemu, A:C, taper).
7. **Denná korekcia (LLM):** ak je dnešná/blízka forma slabá, navrhni zmäkčenie alebo
   presun — s odôvodnením.
8. **LLM komentár** po slovensky: prečo tieto tréningy, na čo si dať pozor.
9. Plán len pre **zvyšok aktuálneho týždňa** (už hotové) — generuje sa s plnými dátumami.

### 2.4 Guardraily (tvrdé pravidlá v kóde)
- Dlhý beh ≤ 30 % týždenného objemu a ≤ 16 míľ.
- Nikdy 2 SOS za sebou.
- A:C > 1.4 alebo nízka pripravenosť → automaticky ponúknuť zmäkčenie.
- Speed tempo nikdy pomalšie než Strength; Strength nikdy pomalšie než Tempo (sanity).

---

## ČASŤ 3 — Zápis tréningov do hodiniek (Garmin)

### 3.1 Dátový model (čo už máme)
`RunningWorkout → WorkoutSegment → ExecutableStep` s `stepType` (warmup/interval/
recovery/cooldown), `endCondition` (distance/lapButton/time) a `targetType`
(pace=`speed.zone`, `heart.rate.zone`, alebo `no.target`). Toto je správny základ.

### 3.2 Odporúčania na presný a „čitateľný v hodinkách" zápis
1. **Tempo = primárny cieľ** pre kroky (`speed.zone` z m/s). HR len ako informácia v
   názve/popise kroku, nie ako target (rieši cardiac-drift pípanie). *(Zmena oproti dnešku,
   kde Easy išlo na HR target.)*
2. **Intervaly ako opakovací blok (repeat), nie 12 samostatných krokov.** Garmin podporuje
   `RepeatGroupDTO` (typ kroku „repeat" s `numberOfIterations` a vnorenými krokmi run+recovery).
   Tým sa v hodinkách zobrazí „1/12, 2/12…" a tréning je prehľadný. **Toto teraz nerobíme —
   treba doplniť do buildera.**
3. **Pauzy medzi úsekmi** = `recovery` krok, končený **vzdialenosťou** (napr. 400m) alebo
   **lap-button** (manuálne), bez tempového cieľu (`no.target`).
4. **WU/CD** = samostatné `warmup`/`cooldown` kroky s Easy tempovým rozsahom.
5. **Tempo/pace cieľ ako rozsah** (targetValueOne/Two = m/s rýchlejší/pomalší okraj) —
   pozor na jednotky: Garmin chce m/s; korektne mapovať z „min/km".
6. **Trvanie odhadnúť** z hlavného tempa kroku (kvôli kalendáru), nie z default „6:00".
7. **Idempotencia a čistenie:** pri opätovnom zápise toho istého dňa **najprv zmazať/prepísať**
   starý naplánovaný tréning (dnes hrozí duplicita). Dať tréningom konzistentné názvy
   (napr. „[Hanson T4] Speed 6×800m") na ľahšiu deduplikáciu.
8. **Bezpečné plánovanie:** upload → `schedule_workout(id, date)`; overiť `workoutId`,
   ošetriť čiastočné zlyhania (časť nahraná) a vrátiť používateľovi prehľad.

### 3.3 Edge-cases
- Bežiaci pás/kopce/teplo → do popisu pridať pokyn „bež podľa úsilia".
- Krátke úseky (400m) v tempovom cieli — overiť, že hodinky stihnú auto-lap.
- Časové pásmo dátumu (lokálny dátum vs UTC) pri plánovaní.

---

## ČASŤ 4 — Návrhy a implementačný plán (UI/UX)

### 4.1 UX koncept
- **Plán = týždenný kalendár** (Po–Ne) s farebne odlíšenými typmi (Easy/Speed/Strength/
  Tempo/Long/Rest) a jasným **dňom + dátumom** pri každom tréningu. *(Deň pri tréningu už
  doplnený v generátore.)*
- **Karta tréningu** ukazuje: typ, hlavné tempo (a vedľa HR-referenciu „~150 bpm"), WU/CD,
  úseky/pauzy, a krátke **„Prečo"** (1 veta z metodiky: napr. „Speed @ 5K pre VO2max").
- **Editovateľnosť pred zápisom** (už máme) + tlačidlo **„Spýtať sa trénera"** (už máme).
- **Compliance pohľad:** zmeškané SOS zvýraznené, návrh presunu.
- **Denná korekcia na Prehľade:** ak je forma slabá, karta „Dnešný tréning navrhujem
  zmäkčiť" s 1-klik úpravou.
- **Transparentnosť dát:** malé „i" ukáže, z akých Garmin dát (LTHR, 5K forma, cieľ) sú
  tempá počítané — buduje dôveru.

### 4.2 Implementačný plán (fázovaný)

**P0 — hotové (tento a predošlé commity)**
- Pondelkové hranice týždňa; rada už neodseknutá; generátor len pre aktuálny týždeň +
  dnešok + dátumy; handoff do chatu; warmup/cooldown pravidlo v promptoch (textovo).

**P1 — Deterministické tempá a fakty (backend) — ✅ HOTOVÉ**
- `hansons_knowledge.py`: Strength = HMP−10 s/míľu (−6 s/km); Easy = tempo (nie tep);
  WU/CD rozsah 1–3 míle; Speed z VO2max. Metodika, `paces_block`, `phase_block` aj
  `hr_zones_block` preformulované na pace-first (HR = referencia/strop).
- `compute_training_paces(goal, vo2max)` + `estimate_5k_pace_sec(vo2max)` (ACSM inverz,
  mierne konzervatívne); sanity poradie speed<strength<tempo≤easy.
- Generátorové prompty (weekly/single/update) + chat prompt: všetky behy TEMPOM,
  HR len v popise; WU/CD 2–4 km; Easy/Dlhé bez WU/CD.

**P2 — Deterministický builder tréningov + watch zápis (backend)**
- `build_week(profile, fitness, available_days)` → štruktúra týždňa z 1.5 (kód, nie LLM).
- LLM dostane hotovú štruktúru a robí len denné korekcie + komentár.
- Builder hodiniek: **repeat-bloky** pre intervaly, pace target primárne, recovery kroky,
  WU/CD, idempotentné názvy + dedupe pri uploade.

**P3 — UI/UX (frontend)**
- Týždenný kalendár plánu s typmi a dňami; karta s tempo+HR-ref+„Prečo".
- „i" panel o zdroji temp; compliance zvýraznenie; denná korekcia na Prehľade.

**P4 — Adaptivita (neskôr)**
- Auto-presun zmeškaných SOS; automatické zmäkčenie podľa A:C/HRV; spätné doladenie
  cieľa, ak realita nesedí (VO2max/odbehnuté tempá).

### 4.3 Rozhodnutia (potvrdené 2026-06)
- **Tep (HR):** **tempo primárne pre všetky behy, HR len referencia** (v popise + poistka).
  Easy/Dlhé prejdú z HR-targetu na pace-target. → P1/P2.
- **Aktuálna 5K forma pre Speed:** default **Garmin VO2max odhad** (automatické, vždy
  dostupné). Neskôr možnosť ručnej korekcie v profile (P4).
- **Varianty plánu:** podporiť **všetky tri — Beginner, Advanced, Just Finish.** Líšia sa
  objemom a (Just Finish) absenciou tvrdých intervalov. → builder v P2 parametrizovať
  podľa variantu; pridať výber variantu do profilu/UI (P3).
- **Jednotky:** zjednotiť UI a hodinky na **km** pre SK používateľa (interné výpočty z míľ
  metodiky prepočítať).

### 4.4 Otvorené (na neskôr)
- Presná logika auto-presunu zmeškaných SOS (P4).
- Prahové hodnoty pre auto-zmäkčenie (A:C, HRV, pripravenosť) — odladiť na reálnych dátach.
