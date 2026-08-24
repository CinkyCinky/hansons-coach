# Monitoring — aby appka nezaspávala

Dve služby, na ktorých appka beží, sa pri nečinnosti samy uspia.

| Služba | Čo sa stane | Ako sa to prejaví |
|---|---|---|
| **Render** (backend) | free instance zaspí po ~15 min nečinnosti | prvé načítanie trvá 30–60 s |
| **Supabase** (databáza + prihlásenie) | free projekt sa **pozastaví** po ~7 dňoch nečinnosti | appka sa vôbec nedá otvoriť, prihlásenie hlási chybu spojenia |

Presne to druhé spôsobilo výpadok 22. 8. 2026, keď sa nedalo prihlásiť.

---

## Riešenie: jeden monitor na `/keepalive`

**Na Supabase sa monitor priamo namieriť NEDÁ.** UptimeRobot na Free pláne posiela
požiadavky metódou **HEAD** (metóda sa na tomto pláne nedá zmeniť) a Supabase na HEAD
odpovedá **405 Method Not Allowed** — monitor to potom hlási ako „Down", hoci služba beží.
Overené na všetkých rozumných adresách:

| Adresa | GET | HEAD |
|---|---|---|
| `/auth/v1/health?apikey=…` | **200** | 405 |
| `/auth/v1/settings?apikey=…` | **200** | 405 |
| `/rest/v1/?apikey=…` | 401 (chce `service_role`) | 401 |
| `/rest/v1/<tabuľka>?apikey=…` | 401 (RLS) | 401 |

Preto Supabase budíme **z backendu**: endpoint `/keepalive` si pri každom zavolaní
sám siahne do databázy (`database.ping()`). Keďže naň už monitor chodí kvôli Renderu,
**jeden monitor drží hore obe služby** a druhý netreba.

### Ako to nastaviť

1. Otvor **https://uptimerobot.com**.
2. Over, že máš monitor na `https://hansons-backend.onrender.com/keepalive`,
   typ `HTTP(s)`, interval `5 minutes`, stav zelený.
3. Ak si si medzitým vytvoril samostatný monitor na `…supabase.co/…`, **zmaž ho** —
   na Free pláne bude vždy svietiť červeno (viď tabuľka vyššie) a k ničomu neslúži.

Odpoveď `/keepalive` vyzerá takto:

```json
{"ok": true, "db": true, "timestamp": "2026-08-24T10:32:11.482913"}
```

`db: true` znamená, že aj Supabase odpovedal.

> ⚠️ Toto funguje až **po nasadení** (push na `main` → Render sa sám preloží).
> Dovtedy sa Supabase stále môže po ~7 dňoch nečinnosti pozastaviť.

### Voliteľne: alert, keď vypadne databáza

`/keepalive` vracia `200` aj vtedy, keď Supabase neodpovie — zámerne, aby výpadok
databázy nezhodil monitor Renderu. Ak chceš byť upozornený aj na databázu, pridaj
druhý monitor:

- **Monitor Type:** `Keyword` (tento typ číta telo odpovede, takže posiela GET)
- **URL:** `https://hansons-backend.onrender.com/keepalive`
- **Keyword:** `"db":true`
- **Alert When:** *Keyword Not Exists*

---

## Čo robiť, keď sa appka aj tak nedá otvoriť

1. **Otvor Supabase dashboard.** Ak je projekt pozastavený, uvidíš tlačidlo
   **Restore project** — klikni naň a počkaj 1–2 minúty.
2. **Skontroluj backend:** otvor `https://hansons-backend.onrender.com/` —
   musí vrátiť `{"status":"ok",...}`. Ak nie, pozri Render dashboard.
3. **Prihlasovacia obrazovka appky** ti sama povie, že problém je v spojení a nie
   v hesle — hláška to hovorí výslovne, takže nemusíš skúšať heslá dokola.

---

## Poznámka k API kľúčom

Ak by si niekedy predsa skladal adresu s kľúčom, patrí tam výhradne **`anon` `public`**
kľúč (je aj tak verejný — nájdeš ho v zdrojáku appky v prehliadači).
**Tajný `service_role` kľúč do adresy monitora nikdy nedávaj** — posielal by sa v URL
a zapisoval do logov.
