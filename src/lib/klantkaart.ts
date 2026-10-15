/**
 * De pure kant van de blokken Tijdlijn en E-mails op de klantkaart, zoals
 * `CustomerPage` in het dashboard (src/pages/BbPages1.jsx): icoon en kleur per
 * tijdlijntype (`TIJDLIJN_ICON`, `TIJDLIJN_KLEUR`), de datum
 * (`fmtTijdlijnDate`), de variabelen en controles van het schrijfvak
 * (`handleTemplateSelect`, `handleSendEmail`) en de regel onder een
 * verstuurde mail.
 *
 * Bewust zonder imports: de tests draaien dit bestand rechtstreeks in Node.
 */

/** De iconen van `TIJDLIJN_ICON`, als sleutel; het scherm kiest het lucide-icoon. */
export type TijdlijnIcoon =
  'klant' | 'document' | 'euro' | 'credit' | 'map' | 'pen' | 'mail' | 'agenda' | 'deal' | 'export';

const ICOON: Record<string, TijdlijnIcoon> = {
  klant_aangemaakt: 'klant',
  offerte_aangemaakt: 'document',
  offerte_verzonden: 'document',
  offerte_geaccepteerd: 'document',
  offerte_afgewezen: 'document',
  factuur_aangemaakt: 'euro',
  factuur_verzonden: 'euro',
  factuur_betaald: 'euro',
  creditfactuur_aangemaakt: 'credit',
  project_aangemaakt: 'map',
  project_status_gewijzigd: 'map',
  notitie_toegevoegd: 'pen',
  email_verstuurd: 'mail',
  herinnering_verstuurd: 'mail',
  afspraak_ingepland: 'agenda',
  deal_aangemaakt: 'deal',
  deal_fase_gewijzigd: 'deal',
  export_uitgevoerd: 'export',
};

/** `TIJDLIJN_ICON[type] || <PenLine />`: een onbekend type krijgt de pen. */
export function tijdlijnIcoon(type: string | null | undefined): TijdlijnIcoon {
  return ICOON[String(type ?? '')] ?? 'pen';
}

/** Op volgorde, want `TIJDLIJN_KLEUR` kijkt naar het begin van het type. */
const KLEUR: [string, string][] = [
  ['klant', '#3b82f6'],
  ['offerte', '#f97316'],
  ['factuur', '#10b981'],
  ['credit', '#ef4444'],
  ['project', '#6366f1'],
  ['notitie', '#10b981'],
  ['email', '#0ea5e9'],
  ['herinnering', '#f59e0b'],
  ['afspraak', '#14b8a6'],
  ['deal', '#8b5cf6'],
  ['export', '#64748b'],
];

/**
 * `TIJDLIJN_KLEUR(type)`. Null waar het dashboard `var(--dl)` (de gedempte
 * tekstkleur) gebruikt; het scherm vult dan de gedempte kleur uit het thema in.
 */
export function tijdlijnKleur(type: string | null | undefined): string | null {
  const t = String(type ?? '');
  return KLEUR.find(([voor]) => t.startsWith(voor))?.[1] ?? null;
}

const DAG = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MAAND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const twee = (n: number) => String(n).padStart(2, '0');

/** `fmtTijdlijnDate`: "wo 15 okt · 14:03" (lokale tijd, zonder jaar). */
export function tijdlijnDatum(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${DAG[d.getDay()]} ${d.getDate()} ${MAAND[d.getMonth()]} · ${twee(d.getHours())}:${twee(d.getMinutes())}`;
}

/**
 * De onderregel van een verstuurde mail: "15 okt 2026 14:03 · factuur" —
 * `toLocaleDateString('nl-NL', { day, month: 'short', year, hour, minute })`
 * plus het sjabloontype als de mail uit een sjabloon of document kwam.
 */
export function verstuurdeMailSub(m: { sent_at?: string | null; related_type?: string | null }): string {
  const delen: string[] = [];
  if (m.sent_at) {
    const d = new Date(m.sent_at);
    if (!Number.isNaN(d.getTime())) {
      delen.push(
        `${d.getDate()} ${MAAND[d.getMonth()]} ${d.getFullYear()} ${twee(d.getHours())}:${twee(d.getMinutes())}`,
      );
    }
  }
  if (m.related_type) delen.push(m.related_type);
  return delen.join(' · ');
}

/** De controles van `handleSendEmail`, in dezelfde volgorde en met dezelfde tekst. */
export function klantMailFout(c: { aan: string; onderwerp: string }): string | null {
  if (!c.aan.trim()) return 'E-mailadres is verplicht';
  if (!c.onderwerp.trim()) return 'Onderwerp is verplicht';
  return null;
}

/** Welke lijst getoond wordt: alles, of de eerste `n` (nieuwste eerst). */
export function ingekort<T>(lijst: T[], alles: boolean, n: number): T[] {
  return alles ? lijst : lijst.slice(0, n);
}
