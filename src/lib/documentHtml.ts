/**
 * Een afdrukbare HTML-weergave van een offerte of factuur.
 *
 * Het dashboard maakt de PDF in de browser met jsPDF. De app voegt geen nieuwe
 * afhankelijkheid toe, dus voor een offerte (die nergens als bestand wordt
 * bewaard) en voor een factuur zonder bewaarde PDF bouwen we dezelfde inhoud
 * als HTML: bedrijfsgegevens, klantblok, nummer, datums, regels met
 * BTW-kolom, totalen per tarief en de notitie. Via het printvenster van de
 * browser kan de gebruiker hem als PDF bewaren.
 *
 * Bewust zonder imports: de tests draaien dit bestand rechtstreeks in Node. De
 * totalen komen van de aanroeper (`documentTotalen` uit `documentLogica`), zodat
 * er maar één berekening is.
 */

export type DocumentPartij = {
  naam?: string | null;
  adres?: string | null;
  postcode?: string | null;
  plaats?: string | null;
  email?: string | null;
  telefoon?: string | null;
  kvk?: string | null;
  btw?: string | null;
};

export type DocumentHtmlInvoer = {
  soort: 'offerte' | 'factuur';
  nummer: string;
  datum: string | null;
  geldigTot?: string | null;
  vervaldatum?: string | null;
  kenmerk?: string | null;
  ondertekendOp?: string | null;
  ondertekendDoor?: string | null;
  /** Creditfactuur: de notitie onder het nummer ("Creditering van factuur …"). */
  creditNote?: string | null;
  bedrijf: DocumentPartij & { kleur?: string | null; logoUrl?: string | null };
  klant: DocumentPartij | null;
  regels: {
    omschrijving: string;
    aantal: number;
    eenheid?: string | null;
    prijs: number;
    btwPct: number | null;
    btwRegime?: string | null;
    bedrag: number;
  }[];
  standaardBtwPct?: number;
  /** Uitkomst van `documentTotalen` over dezelfde regels. */
  totalen: { excl: number; btwPerTarief: { pct: number; bedrag: number }[]; incl: number };
  notitie?: string | null;
};

export function escapeHtml(waarde: unknown): string {
  return String(waarde ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const EUR = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
const eur = (n: number) => EUR.format(Number(n) || 0);

/** 'YYYY-MM-DD' → 'DD-MM-YYYY', zoals `fmtDate` in de dashboard-PDF. */
export function datumNL(d: string | null | undefined): string {
  if (!d) return '';
  const delen = String(d).slice(0, 10).split('-');
  if (delen.length !== 3) return String(d);
  return `${delen[2]}-${delen[1]}-${delen[0]}`;
}

function veiligeKleur(kleur: string | null | undefined): string {
  return kleur && /^#[0-9a-fA-F]{6}$/.test(kleur) ? kleur : '#1DDB62';
}

function veiligeUrl(url: string | null | undefined): string | null {
  return url && /^https:\/\//i.test(url) ? url : null;
}

function partijRegels(p: DocumentPartij | null): string {
  if (!p) return '';
  const plaats = [p.postcode, p.plaats].filter(Boolean).join(' ');
  const reg = [p.kvk ? `KvK ${p.kvk}` : '', p.btw ? `BTW ${p.btw}` : ''].filter(Boolean).join(' · ');
  return [
    p.naam ? `<div class="naam">${escapeHtml(p.naam)}</div>` : '',
    p.adres ? `<div>${escapeHtml(p.adres)}</div>` : '',
    plaats ? `<div>${escapeHtml(plaats)}</div>` : '',
    p.email ? `<div>${escapeHtml(p.email)}</div>` : '',
    p.telefoon ? `<div>${escapeHtml(p.telefoon)}</div>` : '',
    reg ? `<div class="zacht">${escapeHtml(reg)}</div>` : '',
  ].join('');
}

function btwKolom(pct: number | null, regime: string | null | undefined, standaard: number): string {
  if (regime === 'verlegd') return 'verlegd';
  if (regime === 'vrijgesteld') return '0%';
  return `${Number(pct ?? standaard)}%`;
}

export function bouwDocumentHtml(i: DocumentHtmlInvoer): string {
  const kleur = veiligeKleur(i.bedrijf.kleur);
  const logo = veiligeUrl(i.bedrijf.logoUrl);
  const standaard = i.standaardBtwPct ?? 21;
  const titel = i.soort === 'factuur' ? (i.creditNote ? 'Creditfactuur' : 'Factuur') : 'Offerte';
  const totalen = i.totalen;

  const meta: [string, string][] = [
    [i.soort === 'factuur' ? 'Factuurnummer' : 'Offertenummer', i.nummer],
    ['Datum', datumNL(i.datum)],
  ];
  if (i.soort === 'factuur') {
    meta.push(['Vervaldatum', datumNL(i.vervaldatum)]);
    if (i.kenmerk) meta.push(['Kenmerk', i.kenmerk]);
  } else {
    meta.push(['Geldig tot', datumNL(i.geldigTot)]);
    if (i.ondertekendOp) meta.push(['Ondertekend', datumNL(i.ondertekendOp)]);
  }

  const notitie =
    i.notitie?.trim() ||
    (i.soort === 'offerte' && i.geldigTot ? `Deze offerte is geldig tot ${datumNL(i.geldigTot)}.` : '');

  const regels = i.regels.length
    ? i.regels
        .map(
          (r) => `<tr>
  <td>${escapeHtml(r.omschrijving)}</td>
  <td class="r">${escapeHtml(String(r.aantal).replace('.', ','))}${r.eenheid ? ` ${escapeHtml(r.eenheid)}` : ''}</td>
  <td class="r">${eur(r.prijs)}</td>
  <td class="r">${btwKolom(r.btwPct, r.btwRegime, standaard)}</td>
  <td class="r">${eur(r.bedrag)}</td>
</tr>`,
        )
        .join('\n')
    : '<tr><td colspan="5" class="zacht">Dit document heeft geen regels.</td></tr>';

  const btwRijen = totalen.btwPerTarief
    .map((t) => `<tr><td>BTW ${t.pct}%</td><td class="r">${eur(t.bedrag)}</td></tr>`)
    .join('');

  const handtekening =
    i.soort === 'offerte' && i.ondertekendOp
      ? `<div class="getekend">Digitaal ondertekend${
          i.ondertekendDoor ? ` door ${escapeHtml(i.ondertekendDoor)}` : ''
        } op ${escapeHtml(datumNL(i.ondertekendOp))}</div>`
      : '';

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(`${titel} ${i.nummer}`)}</title>
<style>
  :root { --accent: ${kleur}; --ink: #0D0D0D; --zacht: #6b7280; --lijn: #e5e7eb; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 16px; background: #fff; color: var(--ink);
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  .vel { max-width: 760px; margin: 0 auto; }
  .kop { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
  .kop img { max-height: 56px; max-width: 200px; }
  .bedrijfsnaam { font-size: 20px; font-weight: 800; }
  .rechts { text-align: right; }
  .zacht { color: var(--zacht); }
  .naam { font-weight: 700; }
  h1 { font-size: 28px; margin: 28px 0 0; }
  .nummer { font-size: 26px; font-weight: 800; color: var(--accent); }
  .meta { border-collapse: collapse; margin-left: auto; }
  .meta td { padding: 1px 0 1px 18px; }
  .meta td:first-child { color: var(--zacht); }
  .meta td:last-child { font-weight: 700; text-align: right; }
  .partijen { display: flex; gap: 24px; margin: 24px 0; }
  .partijen > div { flex: 1; }
  .label { font-size: 11px; font-weight: 700; letter-spacing: .08em; color: var(--zacht); margin-bottom: 4px; }
  table.regels { width: 100%; border-collapse: collapse; }
  table.regels th { text-align: left; font-size: 11px; letter-spacing: .06em; color: var(--zacht);
    border-bottom: 2px solid var(--accent); padding: 6px 4px; }
  table.regels td { border-bottom: 1px solid var(--lijn); padding: 7px 4px; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  table.totalen { margin: 14px 0 0 auto; border-collapse: collapse; min-width: 260px; }
  table.totalen td { padding: 3px 4px; }
  table.totalen tr.eind td { font-weight: 800; font-size: 15px; border-top: 2px solid var(--ink); padding-top: 7px; }
  .notitie { margin-top: 24px; white-space: pre-wrap; }
  .getekend { margin-top: 18px; padding: 10px 12px; border: 1px solid #bbf7d0; background: #f0fdf4;
    color: #15803d; border-radius: 8px; font-weight: 600; }
  .voet { margin-top: 36px; color: var(--zacht); font-size: 11px; text-align: center; }
  @media print { body { padding: 0; } @page { margin: 16mm; } }
  @media (max-width: 560px) { .kop, .partijen { flex-direction: column; } .rechts { text-align: left; } }
</style>
</head>
<body>
<div class="vel">
  <div class="kop">
    <div>${logo ? `<img src="${escapeHtml(logo)}" alt="">` : `<div class="bedrijfsnaam">${escapeHtml(i.bedrijf.naam ?? '')}</div>`}</div>
    <div class="rechts">${partijRegels(i.bedrijf)}</div>
  </div>
  <div class="kop">
    <div>
      <h1>${titel}</h1>
      <div class="nummer">${escapeHtml(i.nummer)}</div>
      ${i.creditNote ? `<div class="zacht">${escapeHtml(i.creditNote)}</div>` : ''}
    </div>
    <table class="meta">${meta
      .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
      .join('')}</table>
  </div>
  <div class="partijen">
    <div><div class="label">VAN</div>${partijRegels(i.bedrijf)}</div>
    <div><div class="label">AAN</div>${partijRegels(i.klant) || '<div class="zacht">Geen klant</div>'}</div>
  </div>
  <table class="regels">
    <thead><tr><th>OMSCHRIJVING</th><th class="r">AANTAL</th><th class="r">EENHEIDSPRIJS</th><th class="r">BTW</th><th class="r">BEDRAG</th></tr></thead>
    <tbody>
${regels}
    </tbody>
  </table>
  <table class="totalen">
    <tr><td>Subtotaal excl. BTW</td><td class="r">${eur(totalen.excl)}</td></tr>
    ${btwRijen}
    <tr class="eind"><td>Totaal incl. BTW</td><td class="r">${eur(totalen.incl)}</td></tr>
  </table>
  ${notitie ? `<div class="notitie">${escapeHtml(notitie)}</div>` : ''}
  ${handtekening}
  <div class="voet">Gegenereerd door BossBase</div>
</div>
</body>
</html>`;
}
