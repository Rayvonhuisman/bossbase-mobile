/**
 * Registratie — dezelfde regels als het dashboard, zonder runtime-imports zodat
 * het los te testen is (`tests/registratie.test.mjs`).
 *
 * Bronnen in het dashboard (BossBase):
 *  - `src/pages/BbAuth.jsx` — RegisterFlow (validateAccount, validateCompany,
 *    TRADES, pakketkeuze) en EmailVerificationScreen.
 *  - `src/components/PasswordStrength.jsx` — RULES / passwordValid.
 *  - `src/lib/telefoon.js` — telefoonFout.
 *  - `src/services/authService.js` — registerWithEmail (metadata) en vertaalAuthFout.
 *
 * Wijzigt het dashboard één van deze, dan hier meeveranderen: verify-code leest
 * de metadata en maakt daarmee het bedrijf aan.
 */

/** Branches gelijk aan TRADES in BbAuth.jsx (en BRANCHES in lib/branches.js). */
export const BRANCHES = [
  'Schilder',
  'Hovenier',
  'Aannemer',
  'Kozijnen',
  'Installateur',
  'Dakdekker',
  'Loodgieter',
  'Elektricien',
  'Schoonmaak',
  'Anders',
] as const;

/** Pakketten waaruit je bij aanmelden kiest. Starter bewust niet (alleen een downgrade na de proef). */
export type Pakket = 'groei' | 'team';

export const PAKKETTEN: readonly { id: Pakket; titel: string; omschrijving: string }[] = [
  {
    id: 'groei',
    titel: 'Groei, voor 1-2 personen',
    omschrijving: "Je werkt alleen of met z'n tweeën. Offertes, facturen, planning en uren, alles in één.",
  },
  {
    id: 'team',
    titel: 'Team, voor 2+ personen',
    omschrijving: 'Meerdere medewerkers of bussen. Met rollen en rechten, teamplanning en voertuigen.',
  },
];

export const PROEF_DAGEN = 14;

// ─── Wachtwoord ─────────────────────────────────────────────────────────────

export const WACHTWOORD_EISEN: readonly { key: string; label: string; test: (p: string) => boolean }[] = [
  { key: 'len', label: 'Minimaal 8 tekens', test: (p) => p.length >= 8 },
  { key: 'upper', label: 'Minimaal 1 hoofdletter', test: (p) => /[A-Z]/.test(p) },
  { key: 'digit', label: 'Minimaal 1 cijfer', test: (p) => /[0-9]/.test(p) },
  { key: 'special', label: 'Minimaal 1 speciaal teken', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function wachtwoordGeldig(wachtwoord: string): boolean {
  return WACHTWOORD_EISEN.every((r) => r.test(wachtwoord));
}

// ─── E-mail en telefoon ─────────────────────────────────────────────────────

/** Zelfde controle als het dashboard: `/^\S+@\S+\.\S+$/`. */
export function emailGeldig(email: string): boolean {
  return /^\S+@\S+\.\S+$/.test(email);
}

/** Eén op één `telefoonFout` uit het dashboard. Lege string = goed. */
export function telefoonFout(invoer: string | null | undefined): string {
  const ruw = (invoer || '').trim();
  if (!ruw) return 'Vul je telefoonnummer in.';
  if (!/^\+?[\d\s\-.()/]+$/.test(ruw))
    return 'Een telefoonnummer bevat alleen cijfers, spaties, streepjes en eventueel een + vooraan.';

  const cijfers = ruw.replace(/\D/g, '');
  const internationaal = ruw.startsWith('+') ? cijfers : cijfers.startsWith('00') ? cijfers.slice(2) : null;

  if (internationaal !== null) {
    if (internationaal.startsWith('31')) {
      const nl = internationaal.slice(2).replace(/^0/, ''); // "+31 (0)6 …" mag ook
      return /^[1-9]\d{8}$/.test(nl) ? '' : 'Dit is geen geldig Nederlands nummer.';
    }
    return /^[1-9]\d{7,14}$/.test(internationaal)
      ? ''
      : 'Vul een geldig nummer in, met landcode (bijv. +32 470 12 34 56).';
  }

  if (/^0[1-9]\d{8}$/.test(cijfers)) return '';
  return 'Vul een geldig telefoonnummer in, bijv. 06-12345678 of +32 470 12 34 56.';
}

// ─── Validatie per stap ─────────────────────────────────────────────────────

export type AccountInvoer = { fullName: string; email: string; password: string; password2: string };
export type BedrijfInvoer = { companyName: string; phone: string; kvk: string; branche: string };

export type AccountFouten = Partial<Record<'fullName' | 'email' | 'password' | 'password2', string>>;
export type BedrijfFouten = Partial<Record<'companyName' | 'phone', string>>;

/**
 * Accountstap. Dezelfde volgorde en meldingen als `validateAccount` in het
 * dashboard; hier per veld zodat elk veld zijn eigen melding toont.
 */
export function accountFouten(v: AccountInvoer): AccountFouten {
  const f: AccountFouten = {};
  if (!v.fullName.trim()) f.fullName = 'Vul je volledige naam in.';
  if (!emailGeldig(v.email)) f.email = 'Vul een geldig e-mailadres in.';
  if (!v.password) f.password = 'Vul een wachtwoord in.';
  else if (!wachtwoordGeldig(v.password)) f.password = 'Vul een wachtwoord in dat aan alle vereisten voldoet.';
  if (!v.password2) f.password2 = 'Herhaal je wachtwoord.';
  else if (v.password !== v.password2) f.password2 = 'Wachtwoorden komen niet overeen.';
  return f;
}

/** Bedrijfsstap: bedrijfsnaam en telefoon verplicht; branche en KvK niet (zoals het dashboard). */
export function bedrijfFouten(v: BedrijfInvoer): BedrijfFouten {
  const f: BedrijfFouten = {};
  if (!v.companyName.trim()) f.companyName = 'Vul je bedrijfsnaam in.';
  const tel = telefoonFout(v.phone);
  if (tel) f.phone = tel;
  return f;
}

export function heeftFouten(f: object): boolean {
  return Object.values(f).some(Boolean);
}

// ─── Metadata voor signUp ───────────────────────────────────────────────────

export type RegistratieInvoer = {
  email: string;
  password: string;
  fullName: string;
  companyName: string;
  phone: string;
  kvk: string;
  branche: string;
  pakket: Pakket | '' | null;
};

export type RegistratieMetadata = {
  full_name: string;
  company_name: string;
  phone: string | null;
  kvk: string | null;
  branche: string | null;
  gekozen_pakket: Pakket;
};

/**
 * `options.data` van `supabase.auth.signUp`, precies als `registerWithEmail` in
 * het dashboard. verify-code leest dit na de verificatie: company_name →
 * bedrijf, phone → profiles.telefoon, branche → companies.branche,
 * gekozen_pakket 'team' → proef op Team (anders Groei).
 *
 * Het dashboard stuurt naam, bedrijfsnaam en KvK zoals ingetypt; wij trimmen
 * ze (de validatie keurt toch al alleen-spaties af). Telefoon trimt het dashboard
 * zelf ook.
 */
export function registratieMetadata(v: RegistratieInvoer): RegistratieMetadata {
  return {
    full_name: v.fullName.trim(),
    company_name: v.companyName.trim(),
    phone: v.phone?.trim() || null,
    kvk: v.kvk?.trim() || null,
    branche: v.branche || null,
    gekozen_pakket: v.pakket === 'team' ? 'team' : 'groei',
  };
}

// ─── Verificatiecode ────────────────────────────────────────────────────────

/** Alleen cijfers, maximaal 6 — zoals het invoerveld van het dashboard. */
export function schoneCode(invoer: string): string {
  return invoer.replace(/\D/g, '').slice(0, 6);
}

/** Seconden voordat "Code opnieuw versturen" kan (de server weigert binnen 60 s ook). */
export const OPNIEUW_NA_SECONDEN = 60;

export type VerifieerAntwoord = {
  success?: boolean;
  alreadyVerified?: boolean;
  code?: string;
  error?: string;
  remaining?: number;
} | null;

export type VerifieerUitkomst = { ok: true } | { ok: false; melding: string; codeLeegmaken: boolean };

/**
 * Antwoord van de Edge Function `verify-code` vertalen, zoals
 * EmailVerificationScreen dat doet: de melding van de server tonen (die is al
 * Nederlands, met het aantal resterende pogingen), en bij EXPIRED, TOO_MANY of
 * NO_CODE het veld leegmaken omdat er een nieuwe code nodig is.
 */
export function verificatieUitkomst(antwoord: VerifieerAntwoord): VerifieerUitkomst {
  if (antwoord?.success) return { ok: true };
  const code = antwoord?.code;
  return {
    ok: false,
    melding: antwoord?.error || 'Code is onjuist.',
    codeLeegmaken: code === 'EXPIRED' || code === 'TOO_MANY' || code === 'NO_CODE',
  };
}

/**
 * Wacht deze gebruiker op de e-mailverificatie? Zelfde regel als de gate in het
 * dashboard (App.jsx): wel een profiel, geen bedrijf en nog niet bevestigd.
 * Uitgenodigde teamleden hebben al een bedrijf en vallen hier dus buiten.
 */
export function wachtOpVerificatie(
  profiel: { company_id?: string | null; email_verified_at?: string | null } | null | undefined,
): boolean {
  return !!profiel && !profiel.company_id && !profiel.email_verified_at;
}

// ─── Foutvertaling ──────────────────────────────────────────────────────────

const VERTALINGEN: Record<string, string> = {
  'Invalid login credentials': 'Onjuist e-mailadres of wachtwoord',
  'Email not confirmed': 'Je e-mailadres is nog niet bevestigd',
  'User not found': 'Geen account gevonden met dit e-mailadres',
  'Email rate limit exceeded': 'Te veel pogingen. Probeer het later opnieuw',
  'Password should be at least 6 characters': 'Wachtwoord moet minimaal 6 tekens zijn',
  'User already registered': 'Er bestaat al een account met dit e-mailadres',
  'Unable to validate email address: invalid format': 'Vul een geldig e-mailadres in',
  'Signup requires a valid password': 'Vul een geldig wachtwoord in',
  'New password should be different from the old password': 'Het nieuwe wachtwoord moet verschillen van het oude',
};

/** Eén op één `vertaalAuthFout` uit het dashboard. */
export function vertaalAuthFout(message: string | null | undefined): string {
  const msg = (message || '').trim();
  const vast = VERTALINGEN[msg];
  if (vast) return vast;
  if (/invalid login credentials/i.test(msg)) return 'Onjuist e-mailadres of wachtwoord';
  if (/email not confirmed|not confirmed/i.test(msg)) return 'Je e-mailadres is nog niet bevestigd';
  if (/user not found/i.test(msg)) return 'Geen account gevonden met dit e-mailadres';
  if (/rate limit/i.test(msg)) return 'Te veel pogingen. Probeer het later opnieuw';
  if (/at least 6 characters/i.test(msg)) return 'Wachtwoord moet minimaal 6 tekens zijn';
  if (/already registered/i.test(msg)) return 'Er bestaat al een account met dit e-mailadres';
  if (/[a-z]/i.test(msg) && /\b(the|invalid|error|failed|should|requires|please|try|credentials)\b/i.test(msg)) {
    return 'Er ging iets mis. Probeer het opnieuw';
  }
  return msg || 'Er ging iets mis. Probeer het opnieuw';
}

// ─── Juridische links ───────────────────────────────────────────────────────

/** De pagina's waar de akkoordtekst van het dashboard naar linkt (relatief op www.bossbase.nl). */
export const JURIDISCH = {
  voorwaarden: 'https://www.bossbase.nl/voorwaarden',
  verwerkersovereenkomst: 'https://www.bossbase.nl/verwerkersovereenkomst',
  privacy: 'https://www.bossbase.nl/privacy',
} as const;
