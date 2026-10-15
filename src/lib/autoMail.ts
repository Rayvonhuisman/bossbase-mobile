/**
 * Automatische klantmails — `triggerAutoEmail` uit emailService.js van het
 * dashboard, het pure deel: welk sjabloon geldt en wat erin komt.
 *
 * Geen rij in `email_templates` → de standaardtekst (`STANDAARD_MAIL_TEMPLATES`).
 * Wel een rij maar uitgezet (niet actief of niet automatisch) → niets
 * versturen. Zo stuurt een uitgezette mail nooit alsnog.
 *
 * Geen imports: draait in de Node-tests.
 */

export type AutoMailType = 'aanvraag_ontvangen' | 'afspraak_bevestiging';

export type AutoMailSjabloon = { onderwerp: string; body: string; body_html: string };

export type AutoMailRij = {
  onderwerp?: string | null;
  body?: string | null;
  body_html?: string | null;
  actief?: boolean | null;
  auto_versturen?: boolean | null;
};

/** `STANDAARD_MAIL_TEMPLATES` (standaardMailTemplates.js), letterlijk. */
export const STANDAARD_AUTO_MAILS: Record<AutoMailType, AutoMailSjabloon> = {
  aanvraag_ontvangen: {
    onderwerp: 'Bedankt voor uw aanvraag, {{klant_naam}}',
    body: 'Beste {{klant_naam}},\n\nBedankt voor uw aanvraag! Wij hebben uw bericht ontvangen en nemen zo spoedig mogelijk contact met u op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
    body_html: '',
  },
  afspraak_bevestiging: {
    onderwerp: 'Bevestiging afspraak op {{afspraak_datum}}',
    body: 'Beste {{klant_naam}},\n\nHierbij bevestigen wij uw afspraak.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nMocht u de afspraak willen verzetten, neem dan tijdig contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
    body_html: '',
  },
};

/** `kiesTemplate`: geen rij → standaard; rij uitgezet → null. */
export function kiesAutoMail(type: AutoMailType, rij: AutoMailRij | null | undefined): AutoMailSjabloon | null {
  if (!rij) return STANDAARD_AUTO_MAILS[type] ?? null;
  if (!(rij.actief && rij.auto_versturen)) return null;
  return { onderwerp: rij.onderwerp ?? '', body: rij.body ?? '', body_html: rij.body_html ?? '' };
}

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Vars = Record<string, string | null | undefined>;

const vervang = (t: string, vars: Vars) =>
  String(t ?? '').replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
const vervangHtml = (t: string, vars: Vars) =>
  String(t ?? '').replace(/\{\{(\w+)\}\}/g, (_, k: string) => (vars[k] == null ? `{{${k}}}` : esc(vars[k] as string)));

/**
 * Onderwerp en binnenkant van de mail, precies als `triggerAutoEmail`:
 * HTML-sjabloon met ge-escapete variabelen, anders de platte tekst als één
 * `<p>` per regel (lege regel = lege string).
 */
export function autoMailInhoud(tpl: AutoMailSjabloon, vars: Vars): { onderwerp: string; binnenHtml: string } {
  const onderwerp = vervang(tpl.onderwerp, vars);
  const binnenHtml = tpl.body_html
    ? vervangHtml(tpl.body_html, vars)
    : vervang(tpl.body, vars)
        .split('\n')
        // Zoals het dashboard: &, < en > escapen, aanhalingstekens niet.
        .map((l) =>
          l.trim() === ''
            ? ''
            : `<p style="margin:0 0 8px 0">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`,
        )
        .join('');
  return { onderwerp, binnenHtml };
}

/** Datum zoals het dashboard hem in de afspraakbevestiging zet: `toLocaleDateString('nl-NL')` → "20-10-2026". */
export function afspraakDatum(iso: string | null | undefined): string {
  if (!iso) return '';
  const [j, m, d] = iso.split('-').map(Number);
  if (!j || !m || !d) return '';
  return `${d}-${m}-${j}`;
}
