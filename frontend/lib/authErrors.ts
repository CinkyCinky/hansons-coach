// Supabase auth chyby → zrozumiteľná slovenčina.
//
// Bez tohto sa používateľovi ukáže surová anglická hláška z knižnice
// („Invalid login credentials“, „Failed to fetch“), z ktorej sa nedozvie, čo má
// urobiť — a napr. sieťovú chybu si vysvetlí ako zlé heslo.

export interface AuthErrorInfo {
  /** Slovenská hláška pre používateľa — vždy hovorí aj ČO ROBIŤ. */
  message: string;
  /** Problém je v sieti/serveri, nie v zadaných údajoch. */
  network?: boolean;
  /** Účet existuje, ale e-mail nie je potvrdený → ponúkni znovuposlanie. */
  unconfirmed?: boolean;
}

interface RawAuthError {
  code?: string;
  status?: number;
  name?: string;
  message?: string;
}

export function translateAuthError(err: unknown): AuthErrorInfo {
  const e = (err ?? {}) as RawAuthError;
  const code = (e.code || "").toLowerCase();
  const raw = (e.message || "").toLowerCase();

  // ── Sieť: požiadavka vôbec neodišla / neprišla odpoveď ──────────────────────
  // Supabase to hlási ako AuthRetryableFetchError (status 0), prehliadač ako
  // TypeError: Failed to fetch. Typicky: offline, blokovač reklám, firemná sieť,
  // VPN — alebo POZASTAVENÝ Supabase projekt (free tier uspí projekt po ~7 dňoch
  // nečinnosti; jeho doména sa potom ani neresolvuje). NIE je to zlé heslo —
  // a to treba povedať nahlas, inak si používateľ začne meniť heslá.
  if (
    e.name === "AuthRetryableFetchError" ||
    e.name === "TypeError" ||
    raw.includes("failed to fetch") ||
    raw.includes("fetch failed") ||
    raw.includes("networkerror") ||
    raw.includes("network request failed") ||
    raw.includes("load failed")
  ) {
    return {
      network: true,
      message:
        "Nepodarilo sa spojiť s prihlasovacím serverom — tvoje heslo s tým nemá nič spoločné. " +
        "Skontroluj internet a skús to znova. Ak si na firemnej alebo školskej sieti, prípadne " +
        "máš zapnutú VPN či blokovač reklám, vypni ich alebo skús iný prehliadač. " +
        "Ak to nepomôže, prihlasovacia služba je pravdepodobne dočasne mimo prevádzky — skús to o chvíľu.",
    };
  }

  // ── Nepotvrdený e-mail ─────────────────────────────────────────────────────
  if (code === "email_not_confirmed" || raw.includes("email not confirmed")) {
    return {
      unconfirmed: true,
      message:
        "Účet existuje, ale e-mail ešte nie je potvrdený. Otvor si potvrdzovací e-mail " +
        "(pozri aj priečinok Spam). Nenašiel si ho? Nižšie si ho môžeš nechať poslať znova.",
    };
  }

  // ── Zlé prihlasovacie údaje ────────────────────────────────────────────────
  if (code === "invalid_credentials" || raw.includes("invalid login credentials")) {
    return {
      message:
        "Nesprávny e-mail alebo heslo. Skontroluj preklep a veľké písmená. " +
        "Ak si heslo nepamätáš, použi „Zabudol si heslo?“ nižšie.",
    };
  }

  // ── Registrácia: e-mail už existuje ────────────────────────────────────────
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    raw.includes("already registered") ||
    raw.includes("already been registered")
  ) {
    return {
      message: "Na tento e-mail už účet existuje. Prihlás sa, alebo si obnov heslo cez „Zabudol si heslo?“.",
    };
  }

  // ── Slabé / rovnaké heslo ──────────────────────────────────────────────────
  if (code === "weak_password" || raw.includes("password should be at least")) {
    return { message: "Heslo je príliš slabé — použi aspoň 8 znakov, ideálne s číslicou." };
  }
  if (code === "same_password" || raw.includes("should be different from the old password")) {
    return { message: "Nové heslo musí byť iné než to pôvodné." };
  }

  // ── Neplatný formát e-mailu ────────────────────────────────────────────────
  if (raw.includes("unable to validate email address") || raw.includes("invalid email")) {
    return { message: "E-mail nemá správny formát. Skontroluj ho (napr. jozko@gmail.com)." };
  }

  // ── Priveľa pokusov ────────────────────────────────────────────────────────
  if (
    code.includes("rate_limit") ||
    e.status === 429 ||
    raw.includes("rate limit") ||
    raw.includes("you can only request this after")
  ) {
    return { message: "Priveľa pokusov za sebou. Počkaj pár minút a skús to znova." };
  }

  // ── Expirovaný / použitý odkaz z e-mailu ───────────────────────────────────
  if (
    code === "otp_expired" ||
    raw.includes("token has expired") ||
    raw.includes("invalid or has expired") ||
    raw.includes("code verifier")
  ) {
    return {
      message:
        "Odkaz na obnovu hesla je neplatný alebo mu vypršala platnosť (platí ~1 hodinu a dá sa " +
        "použiť raz). Vyžiadaj si nový.",
    };
  }

  // ── Neznáma chyba: aspoň nezobraz „[object Object]“ ────────────────────────
  return {
    message: e.message
      ? `Prihlásenie zlyhalo: ${e.message}`
      : "Prihlásenie zlyhalo z neznámeho dôvodu. Skús to prosím znova.",
  };
}
